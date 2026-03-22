const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/appError");
const PlannerTask = require("../models/PlannerTask");
const RevisionEvent = require("../models/RevisionEvent");
const TopicProgress = require("../models/TopicProgress");
const Topic = require("../models/Topic");
const { syncSubjectProgress } = require("../services/subjectProgressService");
const {
  toStartOfDay,
  toEndOfDay,
  computePlannerPriority,
  plannerReason,
  computeRetentionUpdate,
  computeCoverageStatus,
  clamp
} = require("../utils/learningEngine");

async function buildTaskCandidates(userId, date) {
  const progressRows = await TopicProgress.find({ userId })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code" }
    })
    .lean();

  const usableRows = progressRows.filter((row) => row.topicId && row.topicId._id);

  const ranked = usableRows
    .map((row) => {
      const priorityScore = computePlannerPriority(row, date);
      return {
        row,
        priorityScore,
        reason: plannerReason(row, priorityScore, date)
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  return ranked;
}

async function ensureProgressSeeds(userId) {
  const progressCount = await TopicProgress.countDocuments({ userId });
  if (progressCount > 0) {
    return;
  }

  const topics = await Topic.find({}).select("_id").limit(24).lean();
  if (topics.length === 0) {
    return;
  }

  await TopicProgress.insertMany(
    topics.map((topic) => ({
      userId,
      topicId: topic._id
    }))
  );
}

const getDailyPlan = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const regenerate = req.query.regenerate === "true";

  const dayStart = toStartOfDay(date);
  const dayEnd = toEndOfDay(date);

  await ensureProgressSeeds(userId);

  const existing = await PlannerTask.find({
    userId,
    dueDate: { $gte: dayStart, $lte: dayEnd }
  })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code" }
    })
    .sort({ priorityScore: -1, createdAt: 1 });

  if (existing.length > 0 && !regenerate) {
    return res.json({
      success: true,
      plan: {
        date: dayStart,
        regenerated: false,
        tasks: existing
      }
    });
  }

  if (!regenerate) {
    return res.json({
      success: true,
      plan: {
        date: dayStart,
        regenerated: false,
        tasks: []
      }
    });
  }

  if (regenerate) {
    await PlannerTask.deleteMany({
      userId,
      dueDate: { $gte: dayStart, $lte: dayEnd },
      status: "todo"
    });
  }

  const candidates = await buildTaskCandidates(userId, dayStart);

  const selected = candidates.slice(0, 6).map((candidate) => {
    const topic = candidate.row.topicId;
    const estimatedMinutes = 15 + Math.round((100 - candidate.row.retentionScore) / 10);

    return {
      userId,
      topicId: topic._id,
      title: `Revise ${topic.name}`,
      taskType: "review",
      dueDate: dayStart,
      priorityScore: candidate.priorityScore,
      estimatedMinutes: Math.max(10, Math.min(30, estimatedMinutes)),
      reason: candidate.reason,
      source: regenerate ? "rebalance" : "auto"
    };
  });

  if (selected.length > 0) {
    await PlannerTask.insertMany(selected);
  }

  const tasks = await PlannerTask.find({
    userId,
    dueDate: { $gte: dayStart, $lte: dayEnd }
  })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code" }
    })
    .sort({ priorityScore: -1, createdAt: 1 });

  return res.json({
    success: true,
    plan: {
      date: dayStart,
      regenerated: true,
      tasks
    }
  });
});

function buildGoalPriority(row, input, profile) {
  const base = Number(input.priority || 3) * 14;
  const covered = computeCoverageStatus(row.manualCoverage, row.autoCoverageScore);
  const retentionWeakness = 100 - (row.retentionScore || 0);

  const goalTypeBoost =
    input.intent === "cover"
      ? covered
        ? 2
        : 18
      : input.intent === "revise"
        ? covered
          ? 14
          : 6
        : covered
          ? 10
          : 12;

  const knownPenalty = input.alreadyKnown ? -6 : 6;
  const subjectPerformancePenalty = (1 - (profile?.accuracy || 0)) * 14;

  return clamp(
    Math.round(base + retentionWeakness * 0.42 + goalTypeBoost + knownPenalty + subjectPerformancePenalty),
    10,
    100
  );
}

const generateGoalPlan = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { timeframeDays, dailyMinutes, goalType, notes } = req.body;

  await ensureProgressSeeds(userId);

  const selectedTopics = req.body.topics || [];
  const topicIds = selectedTopics.map((entry) => entry.topicId);
  const progressRows = await TopicProgress.find({ userId, topicId: { $in: topicIds } })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code classLevel" }
    })
    .lean();

  const rowByTopicId = new Map(progressRows.map((row) => [String(row.topicId?._id || row.topicId), row]));
  const fallbackTopics = await Topic.find({ _id: { $in: topicIds } })
    .populate("subjectId", "name code classLevel")
    .lean();
  const fallbackByTopicId = new Map(fallbackTopics.map((topic) => [String(topic._id), topic]));

  const subjectProfiles = await syncSubjectProgress(userId);
  const subjectProfileById = new Map(subjectProfiles.map((item) => [String(item.subjectId), item]));

  const rankedInputs = selectedTopics
    .map((input) => {
      const progress = rowByTopicId.get(String(input.topicId));
      const fallbackTopic = fallbackByTopicId.get(String(input.topicId));
      const topic = progress?.topicId || fallbackTopic;
      if (!topic) return null;

      const resolvedRow = progress || {
        retentionScore: 35,
        manualCoverage: null,
        autoCoverageScore: 0,
        topicId: topic
      };

      const subjectProfile = topic.subjectId
        ? subjectProfileById.get(String(topic.subjectId._id || topic.subjectId))
        : null;

      const priorityScore = buildGoalPriority(
        resolvedRow,
        {
          ...input,
          intent: input.intent || goalType || "mixed"
        },
        subjectProfile
      );

      return {
        topic,
        input,
        priorityScore,
        reason:
          input.intent === "cover"
            ? `Goal focus: cover ${topic.name} with current readiness signals`
            : `Goal focus: revise ${topic.name} with retention and score trends`
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.priorityScore - left.priorityScore);

  if (rankedInputs.length === 0) {
    throw new AppError("No valid topics provided for plan generation", 400);
  }

  const today = toStartOfDay(new Date());
  const lastDay = new Date(today);
  lastDay.setDate(lastDay.getDate() + Math.max(0, timeframeDays - 1));
  const endOfWindow = toEndOfDay(lastDay);

  await PlannerTask.deleteMany({
    userId,
    dueDate: { $gte: today, $lte: endOfWindow },
    status: "todo"
  });

  const perTaskMinutes = 20;
  const tasksPerDay = Math.max(1, Math.floor(dailyMinutes / perTaskMinutes));
  const totalTasks = tasksPerDay * timeframeDays;

  const taskPayload = Array.from({ length: totalTasks }, (_item, index) => {
    const dayOffset = Math.floor(index / tasksPerDay);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + dayOffset);

    const selected = rankedInputs[index % rankedInputs.length];
    const topic = selected.topic;
    const intent = selected.input.intent || goalType || "mixed";
    const taskType = intent === "cover" ? "learn" : "review";

    return {
      userId,
      topicId: topic._id,
      title: `${intent === "cover" ? "Cover" : "Revise"} ${topic.name}`,
      taskType,
      dueDate,
      priorityScore: selected.priorityScore,
      estimatedMinutes: perTaskMinutes,
      reason: `${selected.reason}${notes ? ` | Goal note: ${notes}` : ""}`,
      source: "manual"
    };
  });

  await PlannerTask.insertMany(taskPayload);

  const tasks = await PlannerTask.find({
    userId,
    dueDate: { $gte: today, $lte: endOfWindow }
  })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code" }
    })
    .sort({ dueDate: 1, priorityScore: -1, createdAt: 1 });

  res.status(201).json({
    success: true,
    plan: {
      generatedBy: "goal",
      timeframeDays,
      dailyMinutes,
      totalTasks: tasks.length,
      tasks
    }
  });
});

const updatePlannerTaskStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { taskId } = req.params;
  const { status } = req.body;

  const task = await PlannerTask.findOne({ _id: taskId, userId });
  if (!task) {
    throw new AppError("Planner task not found", 404);
  }

  task.status = status;
  if (status === "completed") {
    task.completedAt = new Date();
    task.skippedAt = null;
  }
  if (status === "skipped") {
    task.skippedAt = new Date();
    task.completedAt = null;
  }
  if (status === "todo") {
    task.skippedAt = null;
    task.completedAt = null;
  }

  await task.save();

  if (status === "completed" || status === "skipped") {
    const event = await RevisionEvent.create({
      userId,
      topicId: task.topicId,
      source: "planner_task",
      outcome: status === "completed" ? "completed" : "skipped",
      timeSpentSec: status === "completed" ? task.estimatedMinutes * 60 : 0,
      occurredAt: new Date()
    });

    const progress = await TopicProgress.findOne({ userId, topicId: task.topicId });
    const update = computeRetentionUpdate(progress, event);

    await TopicProgress.findOneAndUpdate(
      { userId, topicId: task.topicId },
      {
        $set: {
          retentionScore: update.retentionScore,
          nextReviewAt: update.nextReviewAt,
          lastReviewedAt: update.lastReviewedAt,
          lastOutcome: update.lastOutcome,
          streak: update.streak,
          totalReviews: update.totalReviews,
          totalCorrect: update.totalCorrect,
          totalIncorrect: update.totalIncorrect,
          autoCoverageScore: update.autoCoverageScore
        }
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    await syncSubjectProgress(userId);
  }

  res.json({ success: true, task });
});

const rebalancePlan = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const date = req.body.date ? new Date(req.body.date) : new Date();

  const dayStart = toStartOfDay(date);
  const dayEnd = toEndOfDay(date);

  const todayTasks = await PlannerTask.find({
    userId,
    dueDate: { $gte: dayStart, $lte: dayEnd }
  });

  const overdueCount = await PlannerTask.countDocuments({
    userId,
    dueDate: { $lt: dayStart },
    status: "todo"
  });

  const skippedToday = todayTasks.filter((task) => task.status === "skipped").length;
  const completedToday = todayTasks.filter((task) => task.status === "completed").length;
  const totalToday = todayTasks.length;

  const completionRate = totalToday > 0 ? completedToday / totalToday : 0;
  const shouldRebalance = overdueCount >= 2 || skippedToday >= 2 || completionRate < 0.4;

  if (!shouldRebalance) {
    return res.json({
      success: true,
      rebalanced: false,
      reason: "No rebalance required for current behavior window"
    });
  }

  await PlannerTask.deleteMany({
    userId,
    dueDate: { $gte: dayStart, $lte: dayEnd },
    status: "todo"
  });

  const candidates = await buildTaskCandidates(userId, dayStart);
  const selected = candidates.slice(0, 6).map((candidate) => ({
    userId,
    topicId: candidate.row.topicId._id,
    title: `Rebalanced: ${candidate.row.topicId.name}`,
    taskType: "review",
    dueDate: dayStart,
    priorityScore: Math.min(100, candidate.priorityScore + 5),
    estimatedMinutes: 20,
    reason: `rebalance trigger: ${candidate.reason}`,
    source: "rebalance"
  }));

  if (selected.length > 0) {
    await PlannerTask.insertMany(selected);
  }

  const tasks = await PlannerTask.find({
    userId,
    dueDate: { $gte: dayStart, $lte: dayEnd }
  })
    .populate({
      path: "topicId",
      select: "name chapter classLevel subjectId",
      populate: { path: "subjectId", select: "name code" }
    })
    .sort({ priorityScore: -1, createdAt: 1 });

  res.json({
    success: true,
    rebalanced: true,
    trigger: {
      overdueCount,
      skippedToday,
      completionRate
    },
    plan: {
      date: dayStart,
      tasks
    }
  });
});

module.exports = {
  getDailyPlan,
  generateGoalPlan,
  updatePlannerTaskStatus,
  rebalancePlan
};
