const asyncHandler = require("../utils/asyncHandler");
const PlannerTask = require("../models/PlannerTask");
const TopicProgress = require("../models/TopicProgress");
const { syncSubjectProgress } = require("../services/subjectProgressService");
const { toStartOfDay, computeCoverageStatus } = require("../utils/learningEngine");

const getProgressOverview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const today = toStartOfDay(new Date());

  const [progressRows, overdueTasks, dueTodayTasks] = await Promise.all([
    TopicProgress.find({ userId }),
    PlannerTask.countDocuments({ userId, status: "todo", dueDate: { $lt: today } }),
    PlannerTask.countDocuments({
      userId,
      status: "todo",
      dueDate: { $gte: today, $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) }
    })
  ]);

  const retentionScore =
    progressRows.length > 0
      ? Math.round(progressRows.reduce((sum, row) => sum + row.retentionScore, 0) / progressRows.length)
      : 0;

  const weakTopics = progressRows.filter((row) => row.retentionScore < 55).length;
  const coveredTopics = progressRows.filter((row) =>
    computeCoverageStatus(row.manualCoverage, row.autoCoverageScore)
  ).length;

  res.json({
    success: true,
    overview: {
      retentionScore,
      weakTopics,
      overdueTasks,
      dueTodayTasks,
      coveredTopics,
      totalTrackedTopics: progressRows.length
    }
  });
});

const getSubjectProgress = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const subjects = await syncSubjectProgress(userId);

  res.json({
    success: true,
    subjects
  });
});

module.exports = {
  getProgressOverview,
  getSubjectProgress
};
