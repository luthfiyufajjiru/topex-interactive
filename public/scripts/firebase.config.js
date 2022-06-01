import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.3/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.3/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSOqRPHtZsUsVaNxI6baACGmyiPO1MD8o",
  authDomain: "topex-interactive.firebaseapp.com",
  projectId: "topex-interactive",
  storageBucket: "topex-interactive.appspot.com",
  messagingSenderId: "151715965758",
  appId: "1:151715965758:web:e74f8ea9464b25133c9a6f",
  measurementId: "G-EP092BEGGQ"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);