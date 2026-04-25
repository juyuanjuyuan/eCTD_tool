import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../stores/useAuthStore';
import { useLicenseStore, isLicenseBlocking } from '../stores/useLicenseStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { user, fetchProfile } = useAuthStore();
  const { status: licenseStatus, fetch: fetchLicense } = useLicenseStore();
  const [loadingProfile, setLoadingProfile] = useState(!user && !!localStorage.getItem('accessToken'));
  const [loadingLicense, setLoadingLicense] = useState(!licenseStatus);

  useEffect(() => {
    if (!user && localStorage.getItem('accessToken')) {
      fetchProfile().finally(() => setLoadingProfile(false));
    } else {
      setLoadingProfile(false);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    if (!licenseStatus) {
      fetchLicense().finally(() => setLoadingLicense(false));
    } else {
      setLoadingLicense(false);
    }
  }, [licenseStatus, fetchLicense]);

  if (loadingProfile || loadingLicense) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user && !localStorage.getItem('accessToken')) {
    return <Navigate to="/login" replace />;
  }

  // License gate: only redirect when enforcement is on AND license is missing/invalid.
  // Activation page itself is exempt to avoid a redirect loop.
  if (isLicenseBlocking(licenseStatus) && location.pathname !== '/activation') {
    return <Navigate to="/activation" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
