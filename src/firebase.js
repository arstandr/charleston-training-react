import { initializeApp } from 'firebase/app'
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import { getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
const firebaseConfig = {
  apiKey: 'AIzaSyDnTQr0tVA_NJqgR5sH8blAkjuuwD8etSs',
  authDomain: 'chartrain-20901.web.app',
  projectId: 'chartrain-20901',
  storageBucket: 'chartrain-20901.firebasestorage.app',
  messagingSenderId: '92245842702',
  appId: '1:92245842702:web:a9e7777cff16a89b25955f',
}
const app = initializeApp(firebaseConfig)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  ignoreUndefinedProperties: true,
})
export const auth = getAuth(app)
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
setPersistence(auth, isSafari ? browserSessionPersistence : browserLocalPersistence).catch(() => {})
export const storage = getStorage(app)
export { app }