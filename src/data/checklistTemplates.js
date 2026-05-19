export const CHECKLIST_TEMPLATES = {
  server_opening: {
    id: 'server_opening',
    title: 'Server Opening Checklist',
    category: 'opening',
    items: [
      { id: 1, task: 'Stock and organize station with napkins, silverware, condiments', required: true },
      { id: 2, task: 'Check cleanliness of menus and polish if needed', required: true },
      { id: 3, task: 'Fill salt, pepper, sugar caddies at all tables', required: true },
      { id: 4, task: 'Wipe down all tables and chairs', required: true },
      { id: 5, task: "Review 86'd items and daily specials with manager", required: true },
      { id: 6, task: 'Check POS system is working and printer has paper', required: true },
      { id: 7, task: 'Review reservation list for the shift', required: false },
      { id: 8, task: 'Ensure sidework from previous shift is complete', required: true },
    ],
  },
  server_closing: {
    id: 'server_closing',
    title: 'Server Closing Checklist',
    category: 'closing',
    items: [
      { id: 1, task: 'Complete all assigned sidework tasks', required: true },
      { id: 2, task: "Restock station for tomorrow's opening shift", required: true },
      { id: 3, task: 'Clean and sanitize all tables in section', required: true },
      { id: 4, task: 'Take out trash and replace liners', required: true },
      { id: 5, task: 'Sweep and mop station area', required: true },
      { id: 6, task: 'Cash out and complete checkout with manager', required: true },
      { id: 7, task: 'Turn in all credit card receipts', required: true },
      { id: 8, task: 'Clock out properly in system', required: true },
    ],
  },
  bartender_opening: {
    id: 'bartender_opening',
    title: 'Bartender Opening Checklist',
    category: 'opening',
    items: [
      { id: 1, task: 'Stock beer coolers and check expiration dates', required: true },
      { id: 2, task: 'Cut fruit garnishes (lemons, limes, oranges)', required: true },
      { id: 3, task: 'Fill ice wells and back up ice bins', required: true },
      { id: 4, task: 'Check liquor inventory and par levels', required: true },
      { id: 5, task: 'Clean bar top, wells, and equipment', required: true },
      { id: 6, task: 'Set up glassware and tools', required: true },
      { id: 7, task: 'Test draft beer lines and adjust CO2 if needed', required: true },
      { id: 8, task: 'Review cocktail specials with manager', required: false },
    ],
  },
  manager_opening: {
    id: 'manager_opening',
    title: 'Manager Opening Checklist',
    category: 'opening',
    items: [
      { id: 1, task: 'Walk entire restaurant and check cleanliness', required: true },
      { id: 2, task: 'Review reservations and staffing levels', required: true },
      { id: 3, task: 'Complete opening cash count', required: true },
      { id: 4, task: 'Check all equipment is functioning (ovens, fryers, POS)', required: true },
      { id: 5, task: "Review 86'd items with kitchen", required: true },
      { id: 6, task: 'Hold pre-shift meeting with staff', required: true },
      { id: 7, task: 'Verify temperature logs are complete', required: true },
      { id: 8, task: 'Unlock doors at opening time', required: true },
    ],
  },
}

export function getChecklistTemplate(role, shiftType) {
  const key = `${(role || '').toLowerCase()}_${(shiftType || '').toLowerCase()}`
  return CHECKLIST_TEMPLATES[key] || null
}

export function createChecklistFromTemplate(templateId, userId, traineeId) {
  const template = CHECKLIST_TEMPLATES[templateId]
  if (!template) return null
  return {
    userId,
    traineeId,
    checklistType: template.category,
    templateId: template.id,
    title: template.title,
    date: new Date().toISOString().split('T')[0],
    items: template.items.map((item) => ({
      ...item,
      completed: false,
      completedAt: null,
      notes: '',
    })),
    status: 'in-progress',
    managerSignoff: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
