// js/firebase-config.js (새로 만든 파일)
const firebaseConfig = {
  apiKey: "AIzaSyANgMobksIBGlAUp7lqb3GZbyIho_4142g",
  authDomain: "mafia-game-5c6db.firebaseapp.com",
  databaseURL: "https://mafia-game-5c6db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mafia-game-5c6db",
  storageBucket: "mafia-game-5c6db.firebasestorage.app",
  messagingSenderId: "211882425801",
  appId: "1:211882425801:web:69b95a32239c16d2f2fc18"
};

// 전역 초기화 실행
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// 전역 window 상자에 데이터베이스 객체를 담아 app.js에 안전하게 넘깁니다.
window.sharedDatabase = firebase.database();