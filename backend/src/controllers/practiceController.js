const asyncHandler = require("../utils/asyncHandler");
const ExamAttempt = require("../models/ExamAttempt");
const TopicProgress = require("../models/TopicProgress");
const Topic = require("../models/Topic");
const RevisionEvent = require("../models/RevisionEvent");
const { syncSubjectProgress } = require("../services/subjectProgressService");
const { applyCoverageSignal } = require("../utils/learningEngine");

function createQuestionId(index) {
  return `p-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeWeaknessByAttempts(attempts) {
  const weakness = new Map();

  attempts.forEach((attempt) => {
    const topicRows = attempt?.result?.topicBreakdown || [];
    topicRows.forEach((row) => {
      const attempted = Number(row.attempted) || 0;
      const accuracy = attempted > 0 ? (Number(row.correct) || 0) / attempted : 0;
      const weaknessScore = 1 - accuracy;
      const key = String(row.topicId);
      weakness.set(key, (weakness.get(key) || 0) + weaknessScore);
    });
  });

  return weakness;
}

async function resolveTopics(userId, includeTopics, excludeTopics) {
  const progressRows = await TopicProgress.find({ userId })
    .populate({ path: "topicId", select: "name" })
    .lean();

  const fromProgress = progressRows.filter((row) => row.topicId).map((row) => row.topicId);
  const fallbackTopics = await Topic.find({}).select("name").limit(60).lean();

  const pool = fromProgress.length > 0 ? fromProgress : fallbackTopics;

  const includeSet = new Set((includeTopics || []).map((name) => name.toLowerCase()));
  const excludeSet = new Set((excludeTopics || []).map((name) => name.toLowerCase()));

  const filtered = pool.filter((topic) => {
    const key = String(topic.name || "").toLowerCase();
    if (includeSet.size > 0 && !includeSet.has(key)) {
      return false;
    }
    if (excludeSet.has(key)) {
      return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : pool;
}

const getNextPracticeSet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const count = req.body.count || 6;

  const [recentAttempts, progressRows] = await Promise.all([
    ExamAttempt.find({ userId, status: "submitted" }).sort({ submittedAt: -1 }).limit(5).lean(),
    TopicProgress.find({ userId }).select("topicId retentionScore manualCoverage autoCoverageScore").lean()
  ]);

  const weaknessByTopic = normalizeWeaknessByAttempts(recentAttempts);

  progressRows.forEach((row) => {
    const key = String(row.topicId);
    const retentionWeakness = 1 - (Math.min(100, Math.max(0, row.retentionScore || 0)) / 100);
    const coverageWeakness = row.manualCoverage === "uncovered" ? 1 : 1 - (row.autoCoverageScore || 0);
    weaknessByTopic.set(key, (weaknessByTopic.get(key) || 0) + retentionWeakness * 0.5 + coverageWeakness * 0.35);
  });

  const topics = await resolveTopics(userId, req.body.includeTopics, req.body.excludeTopics);

  const rankedTopics = topics
    .map((topic) => ({
      topic,
      weakness: weaknessByTopic.get(String(topic._id)) || 0.2
    }))
    .sort((left, right) => right.weakness - left.weakness);

  const selectedTopics = rankedTopics.slice(0, Math.max(1, Math.min(rankedTopics.length, 5)));

  const questions = Array.from({ length: count }, (_value, index) => {
    const selected = selectedTopics[index % selectedTopics.length];
    const topicName = selected.topic.name;

    return {
      questionId: createQuestionId(index),
      topicId: selected.topic._id,
      topicName,
      type: index % 3 === 0 ? "trueFalse" : "mcq",
      prompt:
        index % 3 === 0
          ? `True or False: The fastest way to improve ${topicName} is to skip error review.`
          : `Pick the most effective next step to improve ${topicName} accuracy in timed practice #${index + 1}.`,
      options:
        index % 3 === 0
          ? ["True", "False"]
          : [
              `Run random tests without revisiting ${topicName}`,
              `Review recent mistakes in ${topicName} and retry similar items`,
              `Ignore ${topicName} until final revision week`,
              `Switch entirely to a different subject`
            ],
      whyAssigned: `Assigned because recent signals show weak performance or retention drift in ${topicName}.`
    };
  });

  res.json({
    success: true,
    set: {
      generatedAt: new Date().toISOString(),
      weakTopics: selectedTopics.map((entry) => ({
        topicId: entry.topic._id,
        topicName: entry.topic.name,
        weaknessScore: Number(entry.weakness.toFixed(3))
      })),
      questions
    }
  });
});

const submitPracticeFeedback = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const responses = req.body.responses || [];

  const topicIds = responses.map((response) => response.topicId);
  const topics = await Topic.find({ _id: { $in: topicIds } }).select("_id").lean();
  const validTopicIds = new Set(topics.map((topic) => String(topic._id)));

  const accepted = responses.filter((response) => validTopicIds.has(String(response.topicId)));

  if (accepted.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid topic responses were provided"
    });
  }

  await RevisionEvent.insertMany(
    accepted.map((response) => ({
      userId,
      topicId: response.topicId,
      source: "practice_quiz",
      outcome: response.isCorrect ? "correct" : "incorrect",
      confidence: response.confidence ?? null,
      timeSpentSec: response.timeSpentSec || 0,
      occurredAt: new Date()
    }))
  );

  const progressRows = await TopicProgress.find({
    userId,
    topicId: { $in: accepted.map((response) => response.topicId) }
  })
    .select("topicId autoCoverageScore")
    .lean();
  const progressMap = new Map(progressRows.map((row) => [String(row.topicId), row]));

  const updates = accepted.map((response) => {
    const existing = progressMap.get(String(response.topicId)) || null;
    const signalType = response.isCorrect ? "practice_correct" : "practice_incorrect";
    const autoCoverageScore = applyCoverageSignal(existing, signalType);

    return {
      updateOne: {
        filter: { userId, topicId: response.topicId },
        update: {
          $set: {
            autoCoverageScore
          }
        },
        upsert: true
      }
    };
  });

  if (updates.length > 0) {
    await TopicProgress.bulkWrite(updates, { ordered: false });
  }

  await syncSubjectProgress(userId);

  res.status(201).json({
    success: true,
    feedback: {
      sessionId: req.body.sessionId || null,
      acceptedCount: accepted.length
    }
  });
});

module.exports = {
  getNextPracticeSet,
  submitPracticeFeedback
};
