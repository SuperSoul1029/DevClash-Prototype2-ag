const { z } = require("zod");

const dailyPlanQuerySchema = z.object({
  date: z.string().datetime().optional(),
  regenerate: z.enum(["true", "false"]).optional()
});

const updatePlannerTaskStatusSchema = z.object({
  status: z.enum(["todo", "completed", "skipped"])
});

const rebalancePlanSchema = z.object({
  date: z.string().datetime().optional()
});

const plannerGoalPlanSchema = z.object({
  timeframeDays: z.number().int().min(1).max(60),
  dailyMinutes: z.number().int().min(20).max(480),
  goalType: z.enum(["revise", "cover", "mixed"]).default("mixed"),
  notes: z.string().trim().max(500).optional(),
  topics: z
    .array(
      z.object({
        topicId: z.string().trim().min(1),
        intent: z.enum(["revise", "cover", "mixed"]).default("mixed"),
        alreadyKnown: z.boolean().optional().default(false),
        priority: z.number().int().min(1).max(5).default(3)
      })
    )
    .min(1)
    .max(120)
});

module.exports = {
  dailyPlanQuerySchema,
  updatePlannerTaskStatusSchema,
  rebalancePlanSchema,
  plannerGoalPlanSchema
};
