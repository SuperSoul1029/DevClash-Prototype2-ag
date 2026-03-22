const express = require("express");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  generateExamSchema,
  startExamSchema,
  saveExamSchema,
  submitExamSchema,
  resultParamsSchema
} = require("../validators/testValidators");
const {
  generateExam,
  startExam,
  saveExamAttempt,
  submitExamAttempt,
  getExamResult
} = require("../controllers/testController");

const router = express.Router();

router.post("/generate", requireAuth, validate(generateExamSchema), generateExam);
router.post("/start", requireAuth, validate(startExamSchema), startExam);
router.post("/save", requireAuth, validate(saveExamSchema), saveExamAttempt);
router.post("/submit", requireAuth, validate(submitExamSchema), submitExamAttempt);
router.get("/result/:attemptId", requireAuth, validate(resultParamsSchema, "params"), getExamResult);

module.exports = router;
