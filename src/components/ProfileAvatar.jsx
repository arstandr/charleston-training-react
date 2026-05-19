export default function ProfileAvatar({ user, size = 'md' }) {
  const sizeClasses = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16', xl: 'w-24 h-24' }
  const iconSizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8', xl: 'w-12 h-12' }

  if (user?.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={user.name || 'Profile'}
        loading="lazy"
        className={`${sizeClasses[size]} rounded-full object-cover border-2 border-gray-300`}
      />
    )
  }
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gray-300 flex items-center justify-center border-2 border-gray-400`} aria-hidden>
      <svg className={`${iconSizes[size]} text-gray-500`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    </div>
  )
}
