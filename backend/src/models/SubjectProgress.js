const mongoose = require("mongoose");

const subjectProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true
    },
    subjectName: {
      type: String,
      required: true,
      trim: true
    },
    subjectCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    classLevel: {
      type: String,
      enum: ["11", "12"],
      required: true,
      index: true
    },
    totalTopics: {
      type: Number,
      min: 0,
      default: 0
    },
    coveredTopics: {
      type: Number,
      min: 0,
      default: 0
    },
    notCoveredTopics: {
      type: Number,
      min: 0,
      default: 0
    },
    timesCompleted: {
      type: Number,
      min: 0,
      default: 0
    },
    testsTaken: {
      type: Number,
      min: 0,
      default: 0
    },
    quizzesTaken: {
      type: Number,
      min: 0,
      default: 0
    },
    questionsPracticed: {
      type: Number,
      min: 0,
      default: 0
    },
    correctAnswers: {
      type: Number,
      min: 0,
      default: 0
    },
    accuracy: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    bestScore: {
      type: Number,
      default: 0
    },
    lastTestScore: {
      type: Number,
      default: 0
    },
    lastTestAt: {
      type: Date,
      default: null
    },
    lastActivityAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

subjectProgressSchema.index({ userId: 1, subjectId: 1 }, { unique: true });
subjectProgressSchema.index({ userId: 1, accuracy: -1, updatedAt: -1 });

module.exports = mongoose.model("SubjectProgress", subjectProgressSchema);