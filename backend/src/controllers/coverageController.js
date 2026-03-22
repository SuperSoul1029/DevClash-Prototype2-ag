const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/appError");
const Topic = require("../models/Topic");
const TopicProgress = require("../models/TopicProgress");
const { syncSubjectProgress } = require("../services/subjectProgressService");
const { applyCoverageSignal, computeCoverageStatus } = require("../utils/learningEngine");

async function ensureTopicExists(topicId) {
  const topic = await Topic.findById(topicId).select("_id");
  if (!topic) {
    throw new AppError("Topic not found", 404);
  }
  return topic;
}

const syncCoverageActivity = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { topicId, signalType } = req.body;

  const topic = await ensureTopicExists(topicId);
  const existing = await TopicProgress.findOne({ userId, topicId: topic._id });

  const autoCoverageScore = applyCoverageSignal(existing, signalType);

  const progress = await TopicProgress.findOneAndUpdate(
    { userId, topicId: topic._id },
    {
      $set: {
        autoCoverageScore
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );

  await syncSubjectProgress(userId);

  res.status(201).json({
    success: true,
    coverage: {
      topicId: topic._id,
      signalType,
      autoCoverageScore: progress.autoCoverageScore,
      manualCoverage: progress.manualCoverage,
      effectiveCovered: computeCoverageStatus(progress.manualCoverage, progress.autoCoverageScore)
    }
  });
});

const manualMarkCovered = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { topicId } = req.body;

  const topic = await ensureTopicExists(topicId);

  const progress = await TopicProgress.findOneAndUpdate(
    { userId, topicId: topic._id },
    {
      $set: {
        manualCoverage: "covered",
        manualCoverageUpdatedAt: new Date()
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );

  await syncSubjectProgress(userId);

  res.json({
    success: true,
    coverage: {
      topicId: topic._id,
      autoCoverageScore: progress.autoCoverageScore,
      manualCoverage: progress.manualCoverage,
      effectiveCovered: true
    }
  });
});

const manualUnmarkTopic = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { topicId } = req.body;

  const topic = await ensureTopicExists(topicId);

  const progress = await TopicProgress.findOneAndUpdate(
    { userId, topicId: topic._id },
    {
      $set: {
        manualCoverage: "uncovered",
        manualCoverageUpdatedAt: new Date()
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );

  await syncSubjectProgress(userId);

  res.json({
    success: true,
    coverage: {
      topicId: topic._id,
      autoCoverageScore: progress.autoCoverageScore,
      manualCoverage: progress.manualCoverage,
      effectiveCovered: false
    }
  });
});

const manualResetTopic = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { topicId } = req.body;

  const topic = await ensureTopicExists(topicId);

  const progress = await TopicProgress.findOneAndUpdate(
    { userId, topicId: topic._id },
    {
      $set: {
        manualCoverage: null,
        manualCoverageUpdatedAt: new Date()
      }
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true
    }
  );

  await syncSubjectProgress(userId);

  res.json({
    success: true,
    coverage: {
      topicId: topic._id,
      autoCoverageScore: progress.autoCoverageScore,
      manualCoverage: progress.manualCoverage,
      effectiveCovered: computeCoverageStatus(progress.manualCoverage, progress.autoCoverageScore)
    }
  });
});

const getCoverageState = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const topicFilter = {};

  if (req.query.subjectId) {
    topicFilter.subjectId = req.query.subjectId;
  }
  if (req.query.classLevel) {
    topicFilter.classLevel = req.query.classLevel;
  }

  const topics = await Topic.find(topicFilter)
    .populate("subjectId", "name code classLevel")
    .sort({ classLevel: 1, chapter: 1, name: 1 });

  const topicIds = topics.map((topic) => topic._id);

  const progressRows = await TopicProgress.find({
    userId: new mongoose.Types.ObjectId(userId),
    topicId: { $in: topicIds }
  });

  const progressByTopic = new Map(progressRows.map((row) => [String(row.topicId), row]));

  const state = topics.map((topic) => {
    const progress = progressByTopic.get(String(topic._id));
    const autoCoverageScore = progress?.autoCoverageScore ?? 0;
    const manualCoverage = progress?.manualCoverage ?? null;

    return {
      topic: {
        _id: topic._id,
        name: topic.name,
        chapter: topic.chapter,
        classLevel: topic.classLevel,
        subject: topic.subjectId
      },
      autoCoverageScore,
      manualCoverage,
      effectiveCovered: computeCoverageStatus(manualCoverage, autoCoverageScore),
      confidence: Math.round(autoCoverageScore * 100)
    };
  });

  const coveredCount = state.filter((item) => item.effectiveCovered).length;

  res.json({
    success: true,
    coverage: {
      totalTopics: state.length,
      coveredTopics: coveredCount,
      uncoveredTopics: state.length - coveredCount
    },
    state
  });
});

module.exports = {
  syncCoverageActivity,
  manualMarkCovered,
  manualUnmarkTopic,
  manualResetTopic,
  getCoverageState
};
