const express = require("express");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { getNextPracticeSet, submitPracticeFeedback } = require("../controllers/practiceController");
const { practiceNextSetSchema, practiceFeedbackSchema } = require("../validators/practiceValidators");

const router = express.Router();

router.post("/next-set", requireAuth, validate(practiceNextSetSchema), getNextPracticeSet);
router.post("/feedback", requireAuth, validate(practiceFeedbackSchema), submitPracticeFeedback);

module.exports = router;
