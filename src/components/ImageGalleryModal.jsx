import { useState } from 'react'

export default function ImageGalleryModal({
  galleryItems,
  galleryItemsLoading,
  galleryUploading,
  onSelectImage,
  onUpload,
  onClose,
}) {
  const [gallerySearch, setGallerySearch] = useState('')
  const [imagePickerTab, setImagePickerTab] = useState('gallery')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }} role="dialog" aria-modal="true" aria-labelledby="gallery-title">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col" style={{
        background: 'rgba(248,250,246,0.97)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRadius: 'var(--radius)',
        border: '1px solid rgba(200,210,195,0.5)',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      }}>
        <div className="p-4 flex items-center justify-between gap-2 flex-wrap" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <h2 id="gallery-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Choose image</h2>
          <button type="button" className="text-gray-500 hover:text-gray-700" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="flex" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <button
            type="button"
            onClick={() => setImagePickerTab('gallery')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${imagePickerTab === 'gallery' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-600 hover:text-gray-800'}`}
          >
            Gallery
          </button>
          <button
            type="button"
            onClick={() => setImagePickerTab('upload')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${imagePickerTab === 'upload' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-gray-600 hover:text-gray-800'}`}
          >
            Upload
          </button>
        </div>
        {imagePickerTab === 'gallery' && (
          <>
            <div className="p-4" style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
              <input
                type="text"
                value={gallerySearch}
                onChange={(e) => setGallerySearch(e.target.value)}
                placeholder="Search by item name..."
                className="input-glass text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {galleryItemsLoading ? (
                <p className="text-sm text-gray-500 py-4">Loading gallery…</p>
              ) : (
                (() => {
                  const filteredGallery = galleryItems.filter((i) =>
                    (i.name || '').toLowerCase().includes(gallerySearch.toLowerCase().trim())
                  )
                  return (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {filteredGallery.map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => onSelectImage(i.imageUrl)}
                            className="relative rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] aspect-square bg-gray-100"
                          >
                            <img src={i.imageUrl} alt={i.name || ''} className="w-full h-full object-cover" loading="lazy" />
                            <span className="block truncate text-xs p-1 bg-white/90 absolute bottom-0 left-0 right-0">{i.name || 'Item'}</span>
                          </button>
                        ))}
                      </div>
                      {filteredGallery.length === 0 && (
                        <p className="text-sm text-gray-500 py-4">{gallerySearch ? 'No matching images.' : 'No images in menu yet. Use the Upload tab to add one.'}</p>
                      )}
                    </>
                  )
                })()
              )}
            </div>
          </>
        )}
        {imagePickerTab === 'upload' && (
          <div className="flex-1 overflow-y-auto p-4">
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Upload new image</label>
            <input
              type="file"
              accept="image/*"
              disabled={galleryUploading}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[var(--color-primary)] file:text-white file:cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUpload(file)
                e.target.value = ''
              }}
            />
            {galleryUploading && <p className="mt-2 text-sm text-gray-500">Uploading…</p>}
          </div>
        )}
      </div>
    </div>
  )
}
