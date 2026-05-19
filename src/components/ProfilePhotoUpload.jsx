import { useState } from 'react'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { updateUserProfile } from '../services/userProfileService'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

export default function ProfilePhotoUpload() {
  const { currentUser, updateUser } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUser?.photoURL || null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      alert('Image must be less than 5MB')
      return
    }

    setUploading(true)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result)
    reader.readAsDataURL(file)

    const userId = currentUser?.uid || currentUser?.id
    if (!userId || !storage) {
      setUploading(false)
      return
    }

    try {
      const path = `profile-photos/${userId}/${Date.now()}_${file.name}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      const downloadURL = await getDownloadURL(storageRef)

      await updateUserProfile(userId, {
        photoURL: downloadURL,
        photoPath: path,
        photoUpdatedAt: new Date().toISOString(),
      })
      updateUser({ ...currentUser, photoURL: downloadURL, photoPath: path })
      alert('Profile photo updated successfully!')
    } catch (error) {
      console.error('Error uploading photo:', error)
      alert('Failed to upload photo: ' + (error?.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto() {
    if (!confirm('Remove profile photo?')) return
    const userId = currentUser?.uid || currentUser?.id
    if (!userId) return

    setUploading(true)
    try {
      const path = currentUser?.photoPath
      if (path && storage) {
        try {
          const storageRef = ref(storage, path)
          await deleteObject(storageRef)
        } catch (e) {
          console.warn('Could not delete old photo:', e)
        }
      }
      await updateUserProfile(userId, {
        photoURL: null,
        photoPath: null,
        photoUpdatedAt: new Date().toISOString(),
      })
      updateUser({ ...currentUser, photoURL: null, photoPath: null })
      setPreview(null)
      alert('Profile photo removed')
    } catch (error) {
      console.error('Error removing photo:', error)
      alert('Failed to remove photo: ' + (error?.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        {preview ? (
          <img
            src={preview}
            alt="Profile"
            className="w-32 h-32 rounded-full object-cover border-4 border-green-600"
          />
        ) : (
          <div className="w-32 h-32 rounded-full bg-gray-300 flex items-center justify-center border-4 border-gray-400">
            <svg className="w-16 h-16 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent" />
          </div>
        )}
      </div>
      <label className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 cursor-pointer">
        {preview ? 'Change Photo' : 'Upload Photo'}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
      </label>
      {preview && (
        <button
          type="button"
          onClick={removePhoto}
          disabled={uploading}
          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
        >
          Remove Photo
        </button>
      )}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Recommended: Square image, at least 200×200 pixels, under 5MB
      </p>
    </div>
  )
}
