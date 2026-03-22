const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const TopicProgress = require("../models/TopicProgress");
const RevisionEvent = require("../models/RevisionEvent");
const ExamAttempt = require("../models/ExamAttempt");
const SubjectProgress = require("../models/SubjectProgress");
const { computeCoverageStatus, clamp } = require("../utils/learningEngine");

function toObjectIdString(value) {
  if (!value) return null;
  return String(value);
}

function createBaseAggregate(subject, totalTopics) {
  return {
    userId: null,
    subjectId: subject._id,
    subjectName: subject.name,
    subjectCode: subject.code,
    classLevel: subject.classLevel,
    totalTopics,
    coveredTopics: 0,
    notCoveredTopics: totalTopics,
    timesCompleted: 0,
    testsTaken: 0,
    quizzesTaken: 0,
    questionsPracticed: 0,
    correctAnswers: 0,
    accuracy: 0,
    averageScore: 0,
    bestScore: 0,
    lastTestScore: 0,
    lastTestAt: null,
    lastActivityAt: null,
    _totalScore: 0
  };
}

async function syncSubjectProgress(userId) {
  const subjects = await Subject.find({}).select("name code classLevel").lean();
  if (subjects.length === 0) {
    await SubjectProgress.deleteMany({ userId });
    return [];
  }

  const topics = await Topic.find({ subjectId: { $in: subjects.map((item) => item._id) } })
    .select("_id subjectId")
    .lean();

  const topicIds = topics.map((item) => item._id);
  const topicToSubject = new Map(topics.map((topic) => [toObjectIdString(topic._id), toObjectIdString(topic.subjectId)]));

  const [progressRows, revisionEvents, attempts] = await Promise.all([
    TopicProgress.find({ userId, topicId: { $in: topicIds } })
      .select("topicId manualCoverage autoCoverageScore")
      .lean(),
    RevisionEvent.find({ userId, topicId: { $in: topicIds } })
      .select("topicId outcome source occurredAt")
      .lean(),
    ExamAttempt.find({ userId, status: "submitted" })
      .select("submittedAt result.topicBreakdown")
      .sort({ submittedAt: 1 })
      .lean()
  ]);

  const topicCountBySubject = topics.reduce((accumulator, topic) => {
    const key = toObjectIdString(topic.subjectId);
    accumulator.set(key, (accumulator.get(key) || 0) + 1);
    return accumulator;
  }, new Map());

  const aggregates = new Map();
  subjects.forEach((subject) => {
    const subjectId = toObjectIdString(subject._id);
    const base = createBaseAggregate(subject, topicCountBySubject.get(subjectId) || 0);
    base.userId = userId;
    aggregates.set(subjectId, base);
  });

  progressRows.forEach((row) => {
    const topicId = toObjectIdString(row.topicId);
    const subjectId = topicToSubject.get(topicId);
    const aggregate = subjectId ? aggregates.get(subjectId) : null;
    if (!aggregate) return;

    if (computeCoverageStatus(row.manualCoverage, row.autoCoverageScore)) {
      aggregate.coveredTopics += 1;
    }
  });

  revisionEvents.forEach((event) => {
    const topicId = toObjectIdString(event.topicId);
    const subjectId = topicToSubject.get(topicId);
    const aggregate = subjectId ? aggregates.get(subjectId) : null;
    if (!aggregate) return;

    if (event.outcome === "completed") {
      aggregate.timesCompleted += 1;
    }

    if (event.source === "practice" || event.source === "practice_quiz") {
      aggregate.quizzesTaken += 1;
      aggregate.questionsPracticed += 1;
      if (event.outcome === "correct") {
        aggregate.correctAnswers += 1;
      }
    }

    if (event.occurredAt && (!aggregate.lastActivityAt || new Date(event.occurredAt) > aggregate.lastActivityAt)) {
      aggregate.lastActivityAt = new Date(event.occurredAt);
    }
  });

  attempts.forEach((attempt) => {
    const bySubjectScore = new Map();
    const touchedSubjects = new Set();

    (attempt.result?.topicBreakdown || []).forEach((row) => {
      const topicId = toObjectIdString(row.topicId);
      const subjectId = topicToSubject.get(topicId);
      const aggregate = subjectId ? aggregates.get(subjectId) : null;
      if (!aggregate) return;

      const attempted = Math.max(0, Number(row.attempted) || 0);
      const correct = Math.max(0, Number(row.correct) || 0);
      const score = Number(row.score) || 0;

      aggregate.questionsPracticed += attempted;
      aggregate.correctAnswers += correct;

      touchedSubjects.add(subjectId);
      bySubjectScore.set(subjectId, (bySubjectScore.get(subjectId) || 0) + score);
    });

    touchedSubjects.forEach((subjectId) => {
      const aggregate = aggregates.get(subjectId);
      if (!aggregate) return;

      aggregate.testsTaken += 1;

      const score = Number((bySubjectScore.get(subjectId) || 0).toFixed(2));
      aggregate._totalScore += score;
      aggregate.bestScore = Math.max(aggregate.bestScore, score);

      const submittedAt = attempt.submittedAt ? new Date(attempt.submittedAt) : null;
      if (submittedAt && (!aggregate.lastTestAt || submittedAt >= aggregate.lastTestAt)) {
        aggregate.lastTestAt = submittedAt;
        aggregate.lastTestScore = score;
      }

      if (submittedAt && (!aggregate.lastActivityAt || submittedAt > aggregate.lastActivityAt)) {
        aggregate.lastActivityAt = submittedAt;
      }
    });
  });

  const docs = Array.from(aggregates.values()).map((aggregate) => {
    const covered = Math.min(aggregate.coveredTopics, aggregate.totalTopics);
    const practiced = Math.max(0, aggregate.questionsPracticed);
    const correct = Math.max(0, Math.min(aggregate.correctAnswers, practiced));

    return {
      ...aggregate,
      coveredTopics: covered,
      notCoveredTopics: Math.max(0, aggregate.totalTopics - covered),
      questionsPracticed: practiced,
      correctAnswers: correct,
      accuracy: practiced > 0 ? Number(clamp(correct / practiced, 0, 1).toFixed(3)) : 0,
      averageScore:
        aggregate.testsTaken > 0 ? Number((aggregate._totalScore / aggregate.testsTaken).toFixed(2)) : 0
    };
  });

  const bulkOps = docs.map((doc) => ({
    updateOne: {
      filter: { userId, subjectId: doc.subjectId },
      update: {
        $set: {
          subjectName: doc.subjectName,
          subjectCode: doc.subjectCode,
          classLevel: doc.classLevel,
          totalTopics: doc.totalTopics,
          coveredTopics: doc.coveredTopics,
          notCoveredTopics: doc.notCoveredTopics,
          timesCompleted: doc.timesCompleted,
          testsTaken: doc.testsTaken,
          quizzesTaken: doc.quizzesTaken,
          questionsPracticed: doc.questionsPracticed,
          correctAnswers: doc.correctAnswers,
          accuracy: doc.accuracy,
          averageScore: doc.averageScore,
          bestScore: Number(doc.bestScore.toFixed(2)),
          lastTestScore: Number(doc.lastTestScore.toFixed(2)),
          lastTestAt: doc.lastTestAt,
          lastActivityAt: doc.lastActivityAt
        }
      },
      upsert: true
    }
  }));

  if (bulkOps.length > 0) {
    await SubjectProgress.bulkWrite(bulkOps, { ordered: false });
  }

  await SubjectProgress.deleteMany({ userId, subjectId: { $nin: docs.map((item) => item.subjectId) } });

  return SubjectProgress.find({ userId }).sort({ classLevel: 1, subjectName: 1 }).lean();
}

module.exports = {
  syncSubjectProgress
};