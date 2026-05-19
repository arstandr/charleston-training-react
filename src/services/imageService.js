import { getStorage, ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage'
import { storage } from '../firebase'

/**
 * Upload a file to Firebase Storage at menuItems/{itemId}/{timestamp}_{filename}.
 * @param {File} file - Image file
 * @param {string} itemId - Menu item id for path
 * @returns {Promise<string>} Download URL
 */
export async function uploadFileToStorage(file, itemId) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Please select an image file')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const safeName = (file.name || 'image').replace(/^.*[/\\]/, '').replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'
  const timestamp = Date.now()
  const filename = `${timestamp}_${safeName}`
  if (!filename.endsWith(`.${ext}`) && !safeName.includes('.')) {
    filename = `${timestamp}_${safeName}.${ext}`
  }
  const path = `menuItems/${itemId || 'upload'}/${timestamp}_${safeName.endsWith(`.${ext}`) ? safeName : safeName + '.' + ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: { source: 'menu_studio_upload', uploadedAt: new Date().toISOString() },
  })
  return getDownloadURL(storageRef)
}

/**
 * Fetch an external image URL, upload to Firebase Storage at menuItems/{itemId}/{timestamp}.{ext}, return download URL.
 * Used when importing images from Toast. Returns original URL if already Firebase Storage or on failure.
 * @param {string} url - Source image URL
 * @param {string} itemId - Unique identifier for path
 * @returns {Promise<string>} Firebase Storage download URL or original URL
 */
export async function downloadAndStoreImage(url, itemId) {
  if (!url || !url.startsWith('http')) return url
  if (isFirebaseStorageUrl(url)) return url

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Fetch failed: ' + response.status)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) {
      console.warn('[ImageStore] Not an image:', blob.type)
      return url
    }
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
    const timestamp = Date.now()
    const path = `menuItems/${itemId || 'import'}/${timestamp}.${ext}`
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, blob, {
      contentType: blob.type,
      customMetadata: {
        source: 'toast_import',
        originalUrl: url.slice(0, 200),
        itemId: itemId || '',
        uploadedAt: new Date().toISOString(),
      },
    })
    const downloadUrl = await getDownloadURL(storageRef)
    return downloadUrl
  } catch (error) {
    console.warn('[ImageStore] Failed for', itemId, ':', error.message, '— using original URL')
    return url
  }
}

/**
 * Returns true if url starts with https://firebasestorage.googleapis.com, false otherwise.
 * @param {string} url
 * @returns {boolean}
 */
export function isFirebaseStorageUrl(url) {
  return typeof url === 'string' && url.startsWith('https://firebasestorage.googleapis.com')
}
