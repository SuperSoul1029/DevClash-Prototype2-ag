import { useMemo, useState } from 'react'
import Card from '../components/ui/Card.jsx'
import Badge from '../components/ui/Badge.jsx'
import Chip from '../components/ui/Chip.jsx'
import ChartFrame from '../components/ui/ChartFrame.jsx'
import DataTable from '../components/ui/DataTable.jsx'
import Button from '../components/ui/Button.jsx'
import { useLearning } from '../context/LearningContext.jsx'

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function statusTone(status) {
  if (status === 'Completed') return 'success'
  if (status === 'Overdue' || status === 'Skipped') return 'alert'
  if (status === 'Today') return 'brand'
  return 'neutral'
}

function statusBadge(status) {
  if (status === 'Completed') return 'success'
  if (status === 'Overdue' || status === 'Skipped') return 'warning'
  return 'info'
}

const PLANNER_COLUMNS = [
  { key: 'topic', header: 'Topic' },
  { key: 'subject', header: 'Subject' },
  { key: 'type', header: 'Task Type' },
  { key: 'date', header: 'Date' },
  { key: 'status', header: 'Status' },
  { key: 'actions', header: 'Actions' },
]

function toTopicDefaultConfig(topic) {
  return {
    intent: topic.covered ? 'revise' : 'cover',
    alreadyKnown: Boolean(topic.covered),
    priority: topic.covered ? 3 : 4,
  }
}

function formatAccuracy(value) {
  const safe = Number(value) || 0
  return `${Math.round(safe * 100)}%`
}

function DashboardPage() {
  const [replanDate, setReplanDate] = useState({})
  const [builderOpen, setBuilderOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [planError, setPlanError] = useState('')
  const [selectedTopicIds, setSelectedTopicIds] = useState([])
  const [topicConfig, setTopicConfig] = useState({})
  const [goalType, setGoalType] = useState('mixed')
  const [timeframeDays, setTimeframeDays] = useState(7)
  const [dailyMinutes, setDailyMinutes] = useState(90)
  const [goalNotes, setGoalNotes] = useState('')

  const {
    retentionScore,
    todayPlan,
    overdueTasks,
    weakTopics,
    tasks,
    topics,
    subjectProgress,
    hasGeneratedPlan,
    calendarGroups,
    plannerView,
    completedTasks,
    completeTask,
    skipTask,
    replanTask,
    generateGoalPlan,
    setPlannerView,
  } = useLearning()

  const subjectById = useMemo(
    () => new Map(subjectProgress.map((subject) => [String(subject.subjectId), subject])),
    [subjectProgress],
  )

  const availablePlanTopics = useMemo(
    () => topics.filter((topic) => topic.name && topic.subjectId),
    [topics],
  )

  const selectedCount = selectedTopicIds.length

  const ensureBuilderDefaults = () => {
    if (availablePlanTopics.length === 0) {
      return
    }

    setTopicConfig((current) => {
      const next = { ...current }
      availablePlanTopics.forEach((topic) => {
        if (!next[topic.id]) {
          next[topic.id] = toTopicDefaultConfig(topic)
        }
      })
      return next
    })

    setSelectedTopicIds((current) => {
      if (current.length > 0) {
        return current
      }

      const weakSet = new Set(weakTopics)
      const preferred = availablePlanTopics
        .filter((topic) => weakSet.has(topic.name) || !topic.covered)
        .slice(0, 12)
        .map((topic) => topic.id)

      if (preferred.length > 0) {
        return preferred
      }

      return availablePlanTopics.slice(0, 8).map((topic) => topic.id)
    })
  }

  const openBuilder = () => {
    ensureBuilderDefaults()
    setPlanError('')
    setBuilderOpen(true)
  }

  const toggleTopicSelection = (topicId) => {
    setSelectedTopicIds((current) =>
      current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId],
    )
    setTopicConfig((current) => {
      if (current[topicId]) {
        return current
      }

      const topic = availablePlanTopics.find((item) => item.id === topicId)
      if (!topic) {
        return current
      }

      return {
        ...current,
        [topicId]: toTopicDefaultConfig(topic),
      }
    })
  }

  const updateTopicConfig = (topicId, key, value) => {
    setTopicConfig((current) => ({
      ...current,
      [topicId]: {
        ...(current[topicId] || {}),
        [key]: value,
      },
    }))
  }

  const submitGoalPlan = async () => {
    if (selectedTopicIds.length === 0) {
      setPlanError('Pick at least one topic to generate your plan.')
      return
    }

    setIsGenerating(true)
    setPlanError('')

    try {
      const payloadTopics = selectedTopicIds
        .map((topicId) => {
          const config = topicConfig[topicId] || {}
          return {
            topicId,
            intent: config.intent || goalType,
            alreadyKnown: Boolean(config.alreadyKnown),
            priority: Number(config.priority) || 3,
          }
        })
        .slice(0, 120)

      await generateGoalPlan({
        timeframeDays,
        dailyMinutes,
        goalType,
        notes: goalNotes,
        topics: payloadTopics,
      })

      setBuilderOpen(false)
    } catch {
      setPlanError('Plan generation failed. Please review your goal setup and retry.')
    } finally {
      setIsGenerating(false)
    }
  }

  const stats = [
    {
      label: 'Retention',
      value: `${retentionScore}%`,
      badge: retentionScore >= 70 ? 'On Track' : 'Needs Recovery',
      status: retentionScore >= 70 ? 'success' : 'warning',
    },
    {
      label: 'Today Plan',
      value: `${todayPlan} tasks`,
      badge: todayPlan > 0 ? 'Ready' : 'Clear',
      status: 'info',
    },
    {
      label: 'Weak Topics',
      value: `${weakTopics.length}`,
      badge: weakTopics.length ? 'Watchlist' : 'Healthy',
      status: weakTopics.length ? 'warning' : 'success',
    },
  ]

  const plannerRows = tasks.map((task) => ({
    id: task.id,
    topic: task.topic,
    subject: task.raw?.topicId?.subjectId?.name || 'Subject',
    type: task.type,
    date: formatDate(task.scheduledDate),
    status: (
      <Badge status={statusBadge(task.displayStatus)}>{task.displayStatus}</Badge>
    ),
    actions: (
      <div className="inline-actions">
        <Button
          variant="ghost"
          onClick={() => completeTask(task.id)}
          disabled={task.displayStatus === 'Completed'}
        >
          Complete
        </Button>
        <Button
          variant="ghost"
          onClick={() => skipTask(task.id)}
          disabled={task.displayStatus === 'Completed' || task.displayStatus === 'Skipped'}
        >
          Skip
        </Button>
        <input
          type="date"
          value={replanDate[task.id] ?? ''}
          onChange={(event) =>
            setReplanDate((current) => ({
              ...current,
              [task.id]: event.target.value,
            }))
          }
          aria-label={`Replan ${task.topic}`}
        />
        <Button
          variant="ghost"
          onClick={() => {
            if (replanDate[task.id]) {
              replanTask(task.id, replanDate[task.id])
            }
          }}
          disabled={!replanDate[task.id]}
        >
          Replan
        </Button>
      </div>
    ),
  }))

  const retentionBars = [
    Math.max(retentionScore - 20, 35),
    Math.max(retentionScore - 12, 40),
    Math.max(retentionScore - 6, 45),
    retentionScore,
    Math.min(retentionScore + 4, 95),
    Math.min(retentionScore + 2, 92),
    retentionScore,
  ]

  return (
    <div className="page-grid">
      <section className="hero-panel">
        <p className="eyebrow">Home Dashboard</p>
        <h1>Daily Learning Command Center</h1>
        <p>
          Track retention momentum, run today&apos;s planner workflow, and react to weak concepts.
        </p>
      </section>

      <section className="stats-row" aria-label="Dashboard summary">
        {stats.map((item) => (
          <Card
            key={item.label}
            title={item.label}
            action={<Badge status={item.status}>{item.badge}</Badge>}
          >
            <p className="metric-value">{item.value}</p>
          </Card>
        ))}
      </section>

      <section className="split-grid">
        <Card title="Retention Curve" subtitle="Score updates from planner and topic actions">
          <ChartFrame title="7-day retention" caption="Updates as tasks are completed or skipped">
            <div className="chart-placeholder">
              {retentionBars.map((point, index) => (
                <span key={index} style={{ height: `${point}%` }} />
              ))}
            </div>
          </ChartFrame>
        </Card>

        <Card title="Focus Bands" subtitle="Signals generated from current learning state">
          <div className="chip-row">
            <Chip tone="alert">{overdueTasks} Overdue</Chip>
            <Chip tone="brand">{todayPlan} Today</Chip>
            <Chip tone="success">{completedTasks} Completed</Chip>
          </div>
          <div className="weak-topic-list">
            {weakTopics.length ? (
              weakTopics.slice(0, 5).map((topic) => (
                <Chip key={topic} tone="neutral">
                  {topic}
                </Chip>
              ))
            ) : (
              <p className="muted-copy">No weak topics detected from current signals.</p>
            )}
          </div>
        </Card>

        <Card title="Subject Performance Ledger" subtitle="Unified subject database used across planner, tests, and quizzes">
          <div className="ledger-grid">
            {subjectProgress.length ? (
              subjectProgress.map((subject) => (
                <article key={subject.subjectId} className="ledger-item">
                  <div className="ledger-item__head">
                    <p>{subject.subjectName}</p>
                    <Chip tone="neutral">Class {subject.classLevel}</Chip>
                  </div>
                  <div className="chip-row">
                    <Chip tone={subject.notCoveredTopics > 0 ? 'alert' : 'success'}>
                      {subject.coveredTopics}/{subject.totalTopics} Covered
                    </Chip>
                    <Chip tone="brand">Practiced {subject.questionsPracticed}</Chip>
                    <Chip tone="success">Accuracy {formatAccuracy(subject.accuracy)}</Chip>
                    <Chip tone="neutral">Avg Score {subject.averageScore}</Chip>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted-copy">No subject analytics yet. Complete tasks or attempt tests to build it.</p>
            )}
          </div>
        </Card>
      </section>

      <Card
        title="Today Planner"
        subtitle="Generate a custom AI plan from your goals, topic familiarity, and subject progress"
        action={
          hasGeneratedPlan ? (
            <div className="view-toggle">
              <Button
                variant={plannerView === 'list' ? 'primary' : 'ghost'}
                onClick={() => setPlannerView('list')}
              >
                List
              </Button>
              <Button
                variant={plannerView === 'calendar' ? 'primary' : 'ghost'}
                onClick={() => setPlannerView('calendar')}
              >
                Calendar
              </Button>
              <Button variant="ghost" onClick={openBuilder}>
                Regenerate
              </Button>
            </div>
          ) : null
        }
      >
        {!hasGeneratedPlan && !builderOpen ? (
          <div className="planner-empty-state">
            <Button variant="primary" onClick={openBuilder}>
              Generate Plan
            </Button>
            <p className="muted-copy">
              Start with your goals, topics to revise or cover, timeframe, and familiarity level.
            </p>
          </div>
        ) : null}

        {builderOpen ? (
          <div className="planner-builder">
            <div className="form-grid planner-builder-grid">
              <label>
                Goal Mode
                <select value={goalType} onChange={(event) => setGoalType(event.target.value)}>
                  <option value="mixed">Mixed (cover + revise)</option>
                  <option value="cover">Cover New Topics</option>
                  <option value="revise">Revise Existing Topics</option>
                </select>
              </label>

              <label>
                Time Period (days)
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={timeframeDays}
                  onChange={(event) => setTimeframeDays(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
                />
              </label>

              <label>
                Daily Time Budget (minutes)
                <input
                  type="number"
                  min="20"
                  max="480"
                  value={dailyMinutes}
                  onChange={(event) => setDailyMinutes(Math.max(20, Math.min(480, Number(event.target.value) || 20)))}
                />
              </label>

              <label>
                Notes for AI Planner
                <textarea
                  rows="2"
                  maxLength="500"
                  value={goalNotes}
                  onChange={(event) => setGoalNotes(event.target.value)}
                  placeholder="Example: focus on weak areas before April mock test"
                />
              </label>
            </div>

            <div className="planner-topic-list">
              {availablePlanTopics.length ? (
                availablePlanTopics.map((topic) => {
                  const selected = selectedTopicIds.includes(topic.id)
                  const config = topicConfig[topic.id] || toTopicDefaultConfig(topic)
                  const subject = subjectById.get(String(topic.subjectId))

                  return (
                    <article
                      key={topic.id}
                      className={`planner-topic-row ${selected ? 'planner-topic-row--selected' : ''}`}
                    >
                      <label className="planner-topic-row__select">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleTopicSelection(topic.id)}
                        />
                        <span>{topic.name}</span>
                      </label>

                      <div className="chip-row">
                        <Chip tone={topic.covered ? 'success' : 'alert'}>{topic.covered ? 'Covered' : 'Not Covered'}</Chip>
                        <Chip tone="neutral">{topic.subjectName}</Chip>
                        <Chip tone="brand">Practiced {subject?.questionsPracticed || 0}</Chip>
                        <Chip tone="success">Accuracy {formatAccuracy(subject?.accuracy || 0)}</Chip>
                      </div>

                      {selected ? (
                        <div className="planner-topic-controls">
                          <label>
                            Intent
                            <select
                              value={config.intent}
                              onChange={(event) => updateTopicConfig(topic.id, 'intent', event.target.value)}
                            >
                              <option value="mixed">Auto</option>
                              <option value="cover">Cover</option>
                              <option value="revise">Revise</option>
                            </select>
                          </label>

                          <label>
                            Priority
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={config.priority}
                              onChange={(event) =>
                                updateTopicConfig(
                                  topic.id,
                                  'priority',
                                  Math.max(1, Math.min(5, Number(event.target.value) || 1)),
                                )
                              }
                            />
                          </label>

                          <label className="checkbox-row planner-topic-known">
                            <input
                              type="checkbox"
                              checked={Boolean(config.alreadyKnown)}
                              onChange={(event) =>
                                updateTopicConfig(topic.id, 'alreadyKnown', event.target.checked)
                              }
                            />
                            Already familiar with this topic
                          </label>
                        </div>
                      ) : null}
                    </article>
                  )
                })
              ) : (
                <p className="muted-copy">No topics found yet. Add curriculum topics first.</p>
              )}
            </div>

            <div className="inline-actions">
              <Button variant="ghost" onClick={() => setBuilderOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submitGoalPlan} disabled={isGenerating || selectedCount === 0}>
                {isGenerating ? 'Generating...' : `Generate Plan (${selectedCount} topics)`}
              </Button>
            </div>

            {planError ? <p className="form-error">{planError}</p> : null}
          </div>
        ) : null}

        {hasGeneratedPlan && plannerView === 'list' ? (
          <DataTable columns={PLANNER_COLUMNS} rows={plannerRows} />
        ) : null}

        {hasGeneratedPlan && plannerView === 'calendar' ? (
          <div className="calendar-grid">
            {calendarGroups.map((group) => (
              <article key={group.date} className="calendar-card">
                <p className="calendar-date">{formatDate(group.date)}</p>
                <div className="calendar-items">
                  {group.tasks.map((task) => (
                    <div key={task.id} className="calendar-item">
                      <p>{task.topic}</p>
                      <div className="chip-row">
                        <Chip tone={statusTone(task.displayStatus)}>{task.displayStatus}</Chip>
                        <Chip tone="neutral">{task.durationMin} mins</Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ): null}
      </Card>
    </div>
  )
}

export default DashboardPage
