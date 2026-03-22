const { z } = require("zod");

const practiceNextSetSchema = z.object({
  count: z.number().int().min(3).max(20).optional(),
  includeTopics: z.array(z.string().trim().min(1)).max(60).optional(),
  excludeTopics: z.array(z.string().trim().min(1)).max(60).optional()
});

const practiceFeedbackSchema = z.object({
  sessionId: z.string().trim().min(1).max(120).optional(),
  responses: z
    .array(
      z.object({
        topicId: z.string().trim().min(1),
        isCorrect: z.boolean(),
        confidence: z.number().min(0).max(1).optional(),
        timeSpentSec: z.number().int().min(0).max(1200).optional()
      })
    )
    .min(1)
    .max(200)
});

module.exports = {
  practiceNextSetSchema,
  practiceFeedbackSchema
};
