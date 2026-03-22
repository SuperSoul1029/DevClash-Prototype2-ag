const express = require("express");
const progressController = require("../controllers/progressController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/overview", requireAuth, progressController.getProgressOverview);
router.get("/subjects", requireAuth, progressController.getSubjectProgress);

module.exports = router;
