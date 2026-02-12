import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyDnTQr0tVA_NJqgR5sH8blAkjuuwD8etSs',
  authDomain: 'chartrain-20901.firebaseapp.com',
  projectId: 'chartrain-20901',
  storageBucket: 'chartrain-20901.appspot.com',
  messagingSenderId: '92245842702',
  appId: '1:92245842702:web:a9e7777cff16a89b25955f',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
export { app }
