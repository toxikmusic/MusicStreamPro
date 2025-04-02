import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import AudioPlayer from "@/components/layout/AudioPlayer";
import { MiniPlayer } from "@/components/MiniPlayer";

import Home from "@/pages/home";
import Stream from "@/pages/stream";
import Streams from "@/pages/streams";
import Profile from "@/pages/profile";
import Posts from "@/pages/posts";
import CreatePost from "@/pages/create-post";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Discover from "@/pages/discover";
import Library from "@/pages/library";
import GoLive from "@/pages/go-live";
import AuthPage from "@/pages/auth-page";
import AuthTest from "@/pages/auth-test";
import UploadTrack from "@/pages/upload-track";
import Dashboard from "@/pages/dashboard";
import HealthTest from "@/pages/health-test";
import SharePage from "@/pages/share";
import SearchPage from "@/pages/search";
import TestDeletes from "@/pages/test-deletes";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={Home} />
      <ProtectedRoute path="/streams" component={Streams} />
      <ProtectedRoute path="/stream/:id" component={Stream} />
      <ProtectedRoute path="/profile/:username" component={Profile} />
      <ProtectedRoute path="/posts" component={Posts} />
      <ProtectedRoute path="/posts/new" component={CreatePost} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/discover" component={Discover} />
      <ProtectedRoute path="/library" component={Library} />
      <ProtectedRoute path="/go-live" component={GoLive} />
      <ProtectedRoute path="/upload-track" component={UploadTrack} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/test-deletes" component={TestDeletes} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/auth-test" component={AuthTest} />
      <Route path="/health-test" component={HealthTest} />
      <Route path="/upload-public" component={UploadTrack} />
      <Route path="/share" component={SharePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <AudioPlayerProvider>
            <Router />
            {/* Audio player components */}
            <AudioPlayer />
            <MiniPlayer />
            <Toaster />
          </AudioPlayerProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
