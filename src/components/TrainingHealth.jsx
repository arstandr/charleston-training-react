export default function TrainingHealth({ shifts = '0/6', quizAvg = 0, passRate = 0, needPractice = 0 }) {
  const items = [
    { label: 'Shifts', value: shifts, color: '#2e7d32', bg: 'bg-green-50', text: 'text-green-800' },
    { label: 'Quiz avg', value: `${quizAvg}%`, color: '#1976d2', bg: 'bg-blue-50', text: 'text-blue-800' },
    { label: 'Pass rate', value: `${passRate}%`, color: '#e65100', bg: 'bg-orange-50', text: 'text-orange-800' },
    { label: 'Need practice', value: needPractice, color: '#c62828', bg: 'bg-red-50', text: 'text-red-800' },
  ]
  return (
    <div className="training-health grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value, bg, text }) => (
        <div key={label} className={`rounded-xl border-2 border-gray-200 p-3 ${bg}`}>
          <div className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{label}</div>
          <div className={`mt-0.5 text-lg font-bold ${text}`}>{value}</div>
        </div>
      ))}
    </div>
  )
}
