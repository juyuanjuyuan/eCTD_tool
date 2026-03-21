import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../stores/useAuthStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, fetchProfile } = useAuthStore();
  const [loading, setLoading] = useState(!user && !!localStorage.getItem('accessToken'));

  useEffect(() => {
    if (!user && localStorage.getItem('accessToken')) {
      fetchProfile().finally(() => setLoading(false));
    }
  }, [user, fetchProfile]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user && !localStorage.getItem('accessToken')) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
