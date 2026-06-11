import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore.js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<div>Login page — coming in AB-1001</div>} />
          <Route path="/register" element={<div>Register page — coming in AB-1001</div>} />
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <div>Notes page — coming in AB-1002</div>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/notes" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
