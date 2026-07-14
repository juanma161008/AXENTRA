import React, { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';

import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

import logoAxentraWhite from '../../assets/logo-axentra-white.png';

import '../../styles/auth-login.css';

const Login = () => {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError('');

    const response = await login({
      email: email.trim(),
      password,
    });

    if (!response.success) {
      setError(response.error);
      toast.error(response.error);
      setLoading(false);
      return;
    }

    toast.success(`Bienvenido ${response.user?.nombre || ''}`);
    setLoading(false);
  };

  return (
    <main className="login-page">

      <section className="login-left">

        <div className="login-brand">

          <img
            src={logoAxentraWhite}
            alt="Axentra"
            className="login-brand__logo"
          />

        </div>

      </section>

      <section className="login-right">

        <div className="login-card">

          <div className="login-card__header">

            <span className="login-badge">
              Plataforma Empresarial
            </span>

            <h1>
              Iniciar sesión
            </h1>

            <p>
              Accede a tu espacio de trabajo.
            </p>

          </div>

          <form
            className="login-card__form"
            onSubmit={handleSubmit}
          >

            {error && (
              <div className="auth-form__error">
                {error}
              </div>
            )}

            {/* Correo */}

            <div className="field">

              <div className="field__control">

                <Mail size={18} />

                <input
                  type="email"
                  placeholder="Correo corporativo"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

              </div>

            </div>

            {/* Contraseña */}

            <div className="field">

              <div className="field__control">

                <Lock size={18} />

                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <button
                  type="button"
                  className="field__icon-button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword
                    ? <EyeOff size={18} />
                    : <Eye size={18} />}
                </button>

              </div>

            </div>

            <button
              className="btn btn--primary login-button"
              disabled={loading}
              type="submit"
            >
              {loading ? (
                'Validando...'
              ) : (
                <>
                  Acceder

                  <ArrowRight size={18} />
                </>
              )}
            </button>

          </form>

          <div className="login-footer">
            Microcinco S.A.S © 2026
          </div>

        </div>

      </section>

    </main>
  );
};

export default Login;