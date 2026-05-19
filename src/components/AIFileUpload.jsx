import { useState, useRef } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { storage, db, app } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { createFlashcard } from '../services/flashcardService'

const allowedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]

const MAX_SIZE_MB = 10

const FLASHCARD_DECKS = [
  { id: 'steaks_specialties', name: 'Steaks, Specialties, Chicken & Desserts' },
  { id: 'starters_soups', name: 'Starters, Soups, Salads & Sandwiches' },
  { id: 'bar_beer', name: 'Bar & Beer Knowledge' },
  { id: 'wine_cocktails', name: 'Wine & Cocktail Knowledge' },
  { id: 'bonus_points', name: 'Bonus Points' },
  { id: 'certification', name: 'Study for Certification' },
]

export default function AIFileUpload() {
  const { currentUser } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [dragActive, setDragActive] = useState(false)

  const [generateFlashcards, setGenerateFlashcards] = useState(false)
  const [addToKnowledgeBase, setAddToKnowledgeBase] = useState(false)
  const [selectedDeck, setSelectedDeck] = useState('')
  const [newDeckMode, setNewDeckMode] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')
  const [newDeckDescription, setNewDeckDescription] = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  const fileInputRef = useRef(null)

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer?.files
    if (files?.length) handleFiles(Array.from(files))
  }

  function handleFileInput(e) {
    const files = e.target?.files
    if (files?.length) handleFiles(Array.from(files))
  }

  async function handleFiles(files) {
    const maxBytes = MAX_SIZE_MB * 1024 * 1024
    const currentTotal = uploadedFiles.reduce((sum, f) => sum + f.size, 0)

    // Validate all files first
    const valid = []
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        alert(`"${file.name}" is not a supported file type. Skipping.`)
        continue
      }
      valid.push(file)
    }
    if (!valid.length) return

    const newTotal = currentTotal + valid.reduce((sum, f) => sum + f.size, 0)
    if (newTotal > maxBytes) {
      alert(`Total file size would be ${(newTotal / 1024 / 1024).toFixed(1)}MB. Maximum is ${MAX_SIZE_MB}MB combined.`)
      return
    }

    setUploading(true)
    try {
      const results = []
      for (const file of valid) {
        const timestamp = Date.now()
        const fileName = `ai-uploads/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const storageRef = ref(storage, fileName)
        await uploadBytes(storageRef, file)
        const downloadURL = await getDownloadURL(storageRef)
        results.push({ name: file.name, type: file.type, size: file.size, url: downloadURL, path: fileName })
      }
      setUploadedFiles((prev) => [...prev, ...results])
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed: ' + (error?.message || error))
    } finally {
      setUploading(false)
    }
  }

  function removeFile(index) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function processWithAI() {
    if (!uploadedFiles.length) {
      alert('Please upload at least one file first.')
      return
    }
    if (!generateFlashcards && !addToKnowledgeBase) {
      alert('Please select at least one action (Generate Flashcards or Add to Knowledge Base).')
      return
    }
    if (generateFlashcards) {
      if (!newDeckMode && !selectedDeck) {
        alert('Please select a flashcard deck or create a new one.')
        return
      }
      if (newDeckMode && !newDeckName.trim()) {
        alert('Please enter a name for the new deck.')
        return
      }
    }

    setProcessing(true)
    try {
      const functions = getFunctions(app)
      const processFileFn = httpsCallable(functions, 'processUploadedFile')

      // Process each file and collect results
      const allResults = []
      for (const file of uploadedFiles) {
        const params = {
          fileUrl: file.url,
          fileName: file.name,
          fileType: file.type,
          instruction: addToKnowledgeBase ? 'Add this to the knowledge base' : 'Add this to the knowledge base',
        }
        const result = await processFileFn(params)
        allResults.push({ file: file.name, data: result?.data || {} })
      }

      // Combine preview results from all files
      const previews = allResults.filter(r => r.data.success && r.data.phase === 'preview')
      const merged = allResults.filter(r => r.data.success && r.data.phase === 'merged')

      if (previews.length > 0) {
        const combinedContent = previews.map(r => `--- ${r.file} ---\n${r.data.newContent || ''}`).join('\n\n')
        const combinedSummary = previews.map(r => `${r.file}: ${r.data.summary || 'processed'}`).join('\n')
        const fileNames = previews.map(r => r.file).join(', ')
        setPreviewData({
          phase: 'preview',
          newContent: combinedContent,
          summary: combinedSummary,
          duplicateInfo: previews[0].data.duplicateInfo,
          contentType: previews[0].data.contentType,
          fileName: fileNames,
        })
        setShowPreview(true)
      }

      if (merged.length > 0 && previews.length === 0) {
        alert(`${merged.length} file${merged.length > 1 ? 's' : ''} added to knowledge base.`)
        setShowPreview(false)
        setPreviewData(null)
      }

      const failed = allResults.filter(r => !r.data.success)
      if (failed.length > 0) {
        alert(`${failed.length} file${failed.length > 1 ? 's' : ''} failed: ${failed.map(r => r.file).join(', ')}`)
      }
    } catch (error) {
      console.error('Processing error:', error)
      alert('Processing failed: ' + (error?.message || error?.code || 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  async function handleConfirmMerge() {
    if (!previewData || previewData.phase !== 'preview' || !previewData.newContent || !previewData.fileName) return
    setProcessing(true)
    try {
      const functions = getFunctions(app)
      const processFileFn = httpsCallable(functions, 'processUploadedFile')
      const result = await processFileFn({
        fileName: previewData.fileName,
        confirmMerge: true,
        mergeContent: previewData.newContent,
      })
      const data = result?.data || {}
      if (data.success && data.phase === 'merged') {
        alert(data.message || 'Knowledge base updated.')
        setShowPreview(false)
        setPreviewData(null)
        setUploadedFiles([])
        setAddToKnowledgeBase(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        alert('Merge failed: ' + (data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Merge error:', error)
      alert('Error merging: ' + (error?.message || error?.code || 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  async function confirmSave() {
    if (!previewData) return
    try {
      const uid = currentUser?.uid
      if (previewData.flashcards?.length > 0) {
        for (const card of previewData.flashcards) {
          await createFlashcard({
            ...card,
            createdBy: uid,
            source: 'ai_upload',
          })
        }
      }
      if (previewData.knowledgeChunks?.length > 0) {
        const kbRef = collection(db, 'chatbotKnowledge')
        for (const chunk of previewData.knowledgeChunks) {
          await addDoc(kbRef, {
            ...chunk,
            createdAt: new Date().toISOString(),
            createdBy: uid,
            source: uploadedFiles.map(f => f.name).join(', '),
          })
        }
      }
      alert(`Success!\n\nFlashcards added: ${previewData.flashcards?.length || 0}\nKnowledge chunks added: ${previewData.knowledgeChunks?.length || 0}`)
      setUploadedFiles([])
      setGenerateFlashcards(false)
      setAddToKnowledgeBase(false)
      setSelectedDeck('')
      setNewDeckMode(false)
      setNewDeckName('')
      setNewDeckDescription('')
      setShowPreview(false)
      setPreviewData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      console.error('Save error:', error)
      alert('Failed to save: ' + (error?.message || error))
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🤖</span>
          <div>
            <h2 className="text-xl font-bold text-gray-900">AI File Upload</h2>
            <p className="text-sm text-gray-600">Upload PDFs, Word docs, or images and let AI process them</p>
          </div>
        </div>

        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all
            ${dragActive ? 'border-[var(--color-primary)] bg-green-50' : 'border-gray-300 hover:border-[var(--color-primary)] hover:bg-gray-50'}
            ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
            multiple
          />
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--color-primary)] border-t-transparent mx-auto mb-4" />
              <p className="text-gray-600 font-semibold">Uploading...</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">📁</div>
              <p className="text-green-700 font-bold text-lg mb-2">
                {uploadedFiles.length > 0 ? 'Drop more files or click to add' : 'Drag & drop here or click to choose'}
              </p>
              <p className="text-gray-500 text-sm">Supports: PDF, Word (.docx), Images (PNG, JPG, WebP)</p>
              <p className="text-gray-400 text-xs mt-2">
                {uploadedFiles.length > 0
                  ? `${(uploadedFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)}MB / ${MAX_SIZE_MB}MB used`
                  : `Maximum combined size: ${MAX_SIZE_MB}MB`}
              </p>
            </>
          )}
        </div>

        {uploadedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadedFiles.map((file, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg flex-shrink-0">{file.type.includes('pdf') ? '📄' : file.type.includes('word') ? '📝' : '🖼️'}</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-red-500 hover:text-red-700 text-sm font-medium flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">What should AI do with this file?</label>

              <div className="flex items-start gap-3 mb-4">
                <input
                  type="checkbox"
                  id="action-flashcards"
                  checked={generateFlashcards}
                  onChange={(e) => setGenerateFlashcards(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[var(--color-primary)] rounded focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <div className="flex-1">
                  <label htmlFor="action-flashcards" className="font-semibold text-gray-900 cursor-pointer">
                    ✨ Generate Flashcards
                  </label>
                  <p className="text-sm text-gray-600">Extract key information and create study flashcards</p>
                  {generateFlashcards && (
                    <div className="mt-3 ml-7 space-y-3">
                      <label className="block text-sm font-medium text-gray-700">Add to which deck?</label>
                      <select
                        value={newDeckMode ? 'new' : selectedDeck}
                        onChange={(e) => {
                          if (e.target.value === 'new') {
                            setNewDeckMode(true)
                            setSelectedDeck('')
                          } else {
                            setNewDeckMode(false)
                            setSelectedDeck(e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                      >
                        <option value="">Select a deck...</option>
                        {FLASHCARD_DECKS.map((deck) => (
                          <option key={deck.id} value={deck.id}>{deck.name}</option>
                        ))}
                        <option value="new">➕ Create New Deck</option>
                      </select>
                      {newDeckMode && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="New deck name (e.g., Dessert Menu)"
                            value={newDeckName}
                            onChange={(e) => setNewDeckName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                          />
                          <textarea
                            placeholder="Description (optional)"
                            value={newDeckDescription}
                            onChange={(e) => setNewDeckDescription(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent resize-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="action-knowledge"
                  checked={addToKnowledgeBase}
                  onChange={(e) => setAddToKnowledgeBase(e.target.checked)}
                  className="mt-1 w-4 h-4 text-[var(--color-primary)] rounded focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                <div className="flex-1">
                  <label htmlFor="action-knowledge" className="font-semibold text-gray-900 cursor-pointer">
                    💬 Add to Chatbot Knowledge Base
                  </label>
                  <p className="text-sm text-gray-600">
                    Content will be processed and added to the Gemini chatbot&apos;s training database for better responses
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={processWithAI}
              disabled={processing || (!generateFlashcards && !addToKnowledgeBase)}
              className="w-full px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Processing with AI...
                </>
              ) : (
                '✨ Process with AI'
              )}
            </button>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-bold text-blue-900 mb-2">What can AI do?</p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Extract menu items from restaurant PDFs</li>
            <li>• Convert Word training docs into flashcards</li>
            <li>• Process food images and add to menu database</li>
            <li>• Train the chatbot with your restaurant&apos;s specific info</li>
            <li>• Create quiz questions from training materials</li>
          </ul>
        </div>
      </div>

      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowPreview(false); setPreviewData(null) }}>
          <div
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {previewData.phase === 'preview' && previewData.newContent != null ? (
              <>
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900">📄 {previewData.fileName}</h2>
                  <p className="text-sm text-gray-600 mt-1">Review new content before adding to the chatbot knowledge base</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">Summary</h3>
                    <p className="text-gray-700 text-sm">{previewData.summary || '—'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">Already in knowledge base</h3>
                    <p className="text-gray-600 text-sm">{previewData.duplicateInfo || 'None'}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 mb-2">New content to add</h3>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 max-h-64 overflow-y-auto">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{previewData.newContent}</pre>
                    </div>
                  </div>
                </div>
                <div className="p-6 border-t border-gray-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowPreview(false); setPreviewData(null) }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmMerge}
                    disabled={processing}
                    className="flex-1 px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 font-semibold disabled:opacity-50"
                  >
                    {processing ? 'Adding…' : '✅ Add to Knowledge Base'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-900">Preview AI Generated Content</h2>
                  <p className="text-sm text-gray-600 mt-1">Review before saving to database</p>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {previewData.flashcards?.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-3">✨ Flashcards ({previewData.flashcards.length})</h3>
                      <div className="space-y-3">
                        {previewData.flashcards.map((card, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="font-semibold text-gray-900 mb-2">Front:</div>
                            <div className="text-gray-700 mb-3">{card.front}</div>
                            <div className="font-semibold text-gray-900 mb-2">Back:</div>
                            <div className="text-gray-700">{card.back}</div>
                            <div className="text-xs text-gray-500 mt-2">
                              Deck: {card.deckName} • Category: {card.category || 'General'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {previewData.knowledgeChunks?.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-3">💬 Chatbot Knowledge ({previewData.knowledgeChunks.length} chunks)</h3>
                      <div className="space-y-3">
                        {previewData.knowledgeChunks.slice(0, 5).map((chunk, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="text-sm text-gray-700 line-clamp-3">{chunk.content}</div>
                            <div className="text-xs text-gray-500 mt-2">Type: {chunk.type || 'text'}</div>
                          </div>
                        ))}
                        {previewData.knowledgeChunks.length > 5 && (
                          <p className="text-sm text-gray-500 text-center">...and {previewData.knowledgeChunks.length - 5} more chunks</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-6 border-t border-gray-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setShowPreview(false); setPreviewData(null) }}
                    className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmSave}
                    className="flex-1 px-6 py-3 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 font-semibold"
                  >
                    ✅ Confirm &amp; Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
