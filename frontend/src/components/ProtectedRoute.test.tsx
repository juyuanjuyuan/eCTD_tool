import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

// Mock the auth store
vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '../stores/useAuthStore';

const mockUseAuthStore = useAuthStore as unknown as ReturnType<typeof vi.fn>;

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should render children when user is authenticated', () => {
    mockUseAuthStore.mockReturnValue({
      user: { id: '1', name: 'Test User', email: 'test@example.com' },
      fetchProfile: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should redirect to login when no user and no token', () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      fetchProfile: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/projects']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    // Navigate component renders nothing in the current location
    expect(container.innerHTML).not.toContain('Protected Content');
  });

  it('should show loading spinner while fetching profile', () => {
    localStorage.setItem('accessToken', 'fake-token');
    mockUseAuthStore.mockReturnValue({
      user: null,
      fetchProfile: vi.fn(() => new Promise(() => {})), // never resolves
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    // Should show spinner (Ant Design Spin component)
    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });
});
