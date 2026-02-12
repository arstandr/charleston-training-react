/**
 * Per-shift checklist templates (Server Packet). Used for interactive checklists in ShiftDetailView.
 * Structure: rec.checklists[shiftKey].items[itemId] = { value, label? }, readiness = { knowledge, execution, confidence }
 */
export const CHECKLIST_TEMPLATES = {
  follow: {
    title: 'Follow Shift Checklist',
    dayLabel: 'Day 2 – Follow Shift',
    sections: [
      {
        id: 'seven_steps',
        title: '7 Steps of Service',
        help: 'Trainer fills in each step as discussed.',
        items: [
          { id: 'step_1', type: 'text', label: 'Step 1: Your Section', required: false },
          { id: 'step_2', type: 'text', label: 'Step 2: The Weave', required: false },
          { id: 'step_3', type: 'text', label: 'Step 3: Hobart', required: false },
          { id: 'step_4', type: 'text', label: 'Step 4: P.O.S.', required: false },
          { id: 'step_5', type: 'text', label: 'Step 5: Sidework', required: false },
          { id: 'step_6', type: 'text', label: 'Step 6: Section Needs', required: false },
          { id: 'step_7', type: 'text', label: 'Step 7: Food Run', required: false },
        ],
      },
      {
        id: 'uniform',
        title: 'Uniform / Appearance',
        help: 'Trainer verifies uniform standards before shift.',
        items: [
          { id: 'uniform_hair', type: 'checkbox', label: 'Hair (Females & Males)', required: true },
          { id: 'uniform_shirt', type: 'checkbox', label: 'Shirt', required: true },
          { id: 'uniform_pants', type: 'checkbox', label: 'Pants', required: true },
          { id: 'uniform_socks', type: 'checkbox', label: 'Socks/Shoes', required: true },
          { id: 'uniform_notes', type: 'textarea', label: 'Uniform notes', required: false },
        ],
      },
      {
        id: 'first',
        title: 'First (before trainer has a table)',
        help: 'Items in bold must be discussed this day.',
        items: [
          { id: 'first_pos', type: 'checkbox', label: '15 minutes of POS Practice', required: true },
          { id: 'first_tour', type: 'checkbox', label: 'Tour', required: true },
          { id: 'first_greet_features', type: 'checkbox', label: 'Review – Greet & Features', required: true, discuss: true },
          { id: 'first_sidework', type: 'checkbox', label: 'Review – Side Work (Opening, Running, Closing)', required: true },
        ],
      },
      {
        id: 'table_service',
        title: 'Table Service',
        help: 'Observed during shift.',
        items: [
          { id: 'ts_greet', type: 'checkbox', label: '30-second greet', required: true, discuss: true },
          { id: 'ts_full_hands', type: 'checkbox', label: 'Full Hands In/Out', required: true },
          { id: 'ts_anticipation', type: 'checkbox', label: 'Anticipation (drinks, pre-bus)', required: true },
        ],
      },
      {
        id: 'post_shift',
        title: 'Post-Shift',
        items: [
          { id: 'post_sidework', type: 'checkbox', label: 'Sidework complete', required: true },
          { id: 'post_notes', type: 'textarea', label: 'Notes', required: false },
        ],
      },
      {
        id: 'feedback',
        title: 'Feedback',
        help: 'Overall shift feedback.',
        items: [
          { id: 'overall_rating', type: 'rating', label: 'Overall rating (1–3)', required: true },
          { id: 'strengths', type: 'textarea', label: 'Strengths', required: false },
          { id: 'opportunities', type: 'textarea', label: 'Opportunities', required: false },
          { id: 'goals_next', type: 'textarea', label: 'Goals for next shift', required: false },
        ],
      },
    ],
  },
  rev1: {
    title: '1st Reverse Checklist',
    dayLabel: 'Day 3 – 1st Reverse',
    sections: [
      {
        id: 'uniform',
        title: 'Uniform / Appearance',
        items: [
          { id: 'uniform_checked', type: 'dropdown', label: 'Uniform meets standards', options: ['Pass', 'Needs Work', 'Not Covered'], required: true },
        ],
      },
      {
        id: 'first',
        title: 'First',
        items: [
          { id: 'r1_pos', type: 'checkbox', label: '15 min POS Practice', required: true },
          { id: 'r1_greet', type: 'checkbox', label: 'Review – Greet & Features', required: true },
          { id: 'r1_sidework', type: 'checkbox', label: 'Review – Side Work', required: true },
        ],
      },
      {
        id: 'feedback',
        title: 'Feedback',
        items: [
          { id: 'overall_rating', type: 'rating', label: 'Overall rating', required: true },
          { id: 'strengths', type: 'textarea', label: 'Strengths', required: false },
          { id: 'opportunities', type: 'textarea', label: 'Opportunities', required: false },
          { id: 'goals_next', type: 'textarea', label: 'Goals for next shift', required: false },
        ],
      },
    ],
  },
  rev2: {
    title: '2nd Reverse Checklist',
    dayLabel: 'Day 4 – 2nd Reverse',
    sections: [
      { id: 'uniform', title: 'Uniform', items: [{ id: 'uniform_checked', type: 'dropdown', label: 'Uniform', options: ['Pass', 'Needs Work', 'Not Covered'], required: true }] },
      { id: 'during', title: 'During Shift', items: [{ id: 'during_notes', type: 'textarea', label: 'Notes', required: false }] },
      { id: 'feedback', title: 'Feedback', items: [{ id: 'overall_rating', type: 'rating', label: 'Overall rating', required: true }, { id: 'strengths', type: 'textarea', label: 'Strengths', required: false }, { id: 'opportunities', type: 'textarea', label: 'Opportunities', required: false }, { id: 'goals_next', type: 'textarea', label: 'Goals for next shift', required: false }] },
    ],
  },
  rev3: {
    title: '3rd Reverse Checklist',
    dayLabel: 'Day 5 – 3rd Reverse',
    sections: [
      { id: 'uniform', title: 'Uniform', items: [{ id: 'uniform_checked', type: 'dropdown', label: 'Uniform', options: ['Pass', 'Needs Work', 'Not Covered'], required: true }] },
      { id: 'focus', title: 'Focus with Trainee', items: [{ id: 'focus_notes', type: 'textarea', label: 'Notes', required: false }] },
      { id: 'feedback', title: 'Feedback', items: [{ id: 'overall_rating', type: 'rating', label: 'Overall rating', required: true }, { id: 'strengths', type: 'textarea', label: 'Strengths', required: false }, { id: 'opportunities', type: 'textarea', label: 'Opportunities', required: false }, { id: 'goals_next', type: 'textarea', label: 'Goals for next shift', required: false }] },
    ],
  },
  rev4: {
    title: '4th Reverse (Optional)',
    dayLabel: '4th Reverse Optional',
    sections: [
      { id: 'feedback', title: 'Feedback', items: [{ id: 'notes', type: 'textarea', label: 'Notes', required: false }] },
    ],
  },
  foodrun: {
    title: 'Food Running Shift Checklist',
    dayLabel: 'Food Run',
    sections: [
      { id: 'uniform', title: 'Uniform', items: [{ id: 'uniform_checked', type: 'dropdown', label: 'Uniform', options: ['Pass', 'Needs Work', 'Not Covered'], required: true }] },
      { id: 'during', title: 'During Shift', items: [{ id: 'food_run_covered', type: 'checkbox', label: 'Food run and ticket flow covered', required: true }, { id: 'during_notes', type: 'textarea', label: 'Notes', required: false }] },
      { id: 'feedback', title: 'Feedback', items: [{ id: 'overall_rating', type: 'rating', label: 'Overall rating', required: true }, { id: 'strengths', type: 'textarea', label: 'Strengths', required: false }, { id: 'opportunities', type: 'textarea', label: 'Opportunities', required: false }] },
    ],
  },
  cert: {
    title: 'Certification',
    dayLabel: 'Certification',
    sections: [
      { id: 'feedback', title: 'Final feedback', items: [{ id: 'overall_rating', type: 'rating', label: 'Overall rating', required: true }, { id: 'notes', type: 'textarea', label: 'Notes', required: false }] },
    ],
  },
}

export function getChecklistTemplate(shiftKey) {
  return (CHECKLIST_TEMPLATES && CHECKLIST_TEMPLATES[shiftKey]) || null
}
