// js/auth.js
import { loginUser } from './app.js';

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await loginUser(email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      alert('Login gagal: ' + err.message);
    }
  });
}
