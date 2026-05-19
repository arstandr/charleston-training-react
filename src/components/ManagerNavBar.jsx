import NavDropdown from './NavDropdown'

/**
 * Manager nav: Overview | My Team v | Analytics v | Tools v
 */
export default function ManagerNavBar({
  activeView,
  onViewChange,
  isAdminOrOwner,
  actionItemsCount = 0,
  traineeCount = 0,
  trainerCount = 0,
  archivedCount = 0,
  onAddTrainee,
  onOpenArchived,
  onOpenLegacyLocks,
  onSyncSchedules,
  onSyncTrainers,
  onSyncTrainees,
  onSyncManagers,
  onSyncFromToast,
  onNavigateMenu,
  onNavigateMenuStudio,
}) {
  const teamItems = [
    { id: 'trainees', label: 'Trainees', icon: '\u{1F465}', description: 'View and manage all trainees', badge: traineeCount || null },
    { id: 'trainers', label: 'Trainers', icon: '\u{1F3C6}', description: 'Trainer cards and ratings', badge: trainerCount || null },
    { id: 'schedule', label: 'Schedule', icon: '\u{1F4CB}', description: 'Training schedule grid' },
    ...(isAdminOrOwner
      ? [{ id: 'teamSchedules', label: 'Team Schedules', icon: '\u{1F4C5}', description: 'Cross-store schedules from Toast' }]
      : []),
    { separator: true },
    { id: 'action:addTrainee', label: 'Add Trainee', icon: '\u2795', description: 'Register a new trainee' },
    { id: 'action:archived', label: 'Archived', icon: '\u{1F4E6}', description: 'View and restore archived staff', badge: archivedCount || null },
  ]

  const analyticsItems = [
    { id: 'analytics:overview', label: 'Overview', icon: '\u{1F4CA}', description: 'Risk scores, compliance, skill gaps' },
    { id: 'analytics:trainees', label: 'Trainee Progress', icon: '\u{1F4C8}', description: 'Certification timelines, dropout funnel' },
    { id: 'analytics:trainers', label: 'Trainer Performance', icon: '\u2B50', description: 'Workload, effectiveness, skip rates' },
    { id: 'analytics:managers', label: 'Manager Metrics', icon: '\u2705', description: 'Sign-off turnaround, premature alerts' },
    { id: 'analytics:tests', label: 'Tests & Quizzes', icon: '\u{1F4DD}', description: 'Pass rates, problem questions' },
  ]

  const toolsItems = [
    { id: 'health', label: 'System Health', icon: '\u{1FA7A}', description: 'Backend status, bottleneck analysis' },
    { id: 'testIntegrity', label: 'Test Integrity', icon: '\u{1F512}', description: 'Active locks, violations' },
    { id: 'action:legacyLocks', label: 'Legacy Locks', icon: '\u{1F513}', description: 'Release stuck test sessions' },
    { separator: true },
    { id: 'uploadSchedule', label: 'Upload Schedule', icon: '\u{1F4E4}', description: 'Import from HotSchedules PDF' },
    { id: 'action:syncSchedules', label: 'Sync Schedules', icon: '\u{1F4C5}', description: 'Import shifts from Toast' },
    { id: 'action:syncTrainers', label: 'Sync Trainers', icon: '\u{1F465}', description: 'Update trainer list from Toast' },
    { id: 'action:syncTrainees', label: 'Sync Trainees', icon: '\u{1F393}', description: 'Import new trainees from Toast' },
    { id: 'action:syncManagers', label: 'Sync Managers', icon: '\u{1F3E2}', description: 'Import managers from Toast' },
    ...(isAdminOrOwner
      ? [
          { separator: true },
          { id: 'action:syncFromToast', label: 'Full Toast Sync', icon: '\u{1F504}', description: 'Complete employee sync' },
          { id: 'action:menuManagement', label: 'Menu Management', icon: '\u{1F37D}\uFE0F', description: 'Toast menu sync & cleanup' },
          { id: 'action:menuStudio', label: 'Menu Studio', icon: '\u{1F3A8}', description: 'AI image generation & editing' },
        ]
      : []),
  ]

  // Determine which analytics sub-tab is active (if any)
  const isAnalyticsActive = activeView === 'analytics'

  function handleTeamSelect(id) {
    if (id === 'action:addTrainee') { onAddTrainee?.(); return }
    if (id === 'action:archived') { onOpenArchived?.(); return }
    onViewChange?.(id)
  }

  function handleAnalyticsSelect(id) {
    // All analytics items map to the analytics view with a sub-tab
    onViewChange?.(id)
  }

  function handleToolsSelect(id) {
    if (id === 'action:legacyLocks') { onOpenLegacyLocks?.(); return }
    if (id === 'action:syncSchedules') { onSyncSchedules?.(); return }
    if (id === 'action:syncTrainers') { onSyncTrainers?.(); return }
    if (id === 'action:syncTrainees') { onSyncTrainees?.(); return }
    if (id === 'action:syncManagers') { onSyncManagers?.(); return }
    if (id === 'action:syncFromToast') { onSyncFromToast?.(); return }
    if (id === 'action:menuManagement') { onNavigateMenu?.(); return }
    if (id === 'action:menuStudio') { onNavigateMenuStudio?.(); return }
    onViewChange?.(id)
  }

  // For the analytics dropdown, map the sub-tab to the item id for highlighting
  const analyticsActiveTab = isAnalyticsActive ? `analytics:${activeView.split(':')[1] || 'overview'}` : ''
  // Actually we need to check if activeView starts with 'analytics:'
  const resolvedAnalyticsTab = activeView?.startsWith('analytics:') ? activeView : ''

  return (
    <nav
      className="relative z-20 flex items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-gray-100 mb-6 overflow-visible"
      role="navigation"
      aria-label="Manager dashboard navigation"
    >
      {/* Overview flat button with action-item badge */}
      <button
        type="button"
        onClick={() => onViewChange?.('overview')}
        className={`
          relative flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold
          transition-all duration-200 whitespace-nowrap
          ${activeView === 'overview'
            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-green-900/20'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }
        `}
      >
        Overview
        {actionItemsCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white animate-pulse">
            {actionItemsCount}
          </span>
        )}
      </button>

      <NavDropdown
        label="My Team"
        activeTab={activeView}
        onSelect={handleTeamSelect}
        items={teamItems}
      />

      <NavDropdown
        label="Analytics"
        activeTab={resolvedAnalyticsTab}
        onSelect={handleAnalyticsSelect}
        items={analyticsItems}
      />

      <NavDropdown
        label="Tools"
        activeTab={activeView}
        onSelect={handleToolsSelect}
        items={toolsItems}
      />

    </nav>
  )
}
