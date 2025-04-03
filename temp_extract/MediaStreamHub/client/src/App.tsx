import { Switch, Route, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Play, Radio } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Stream from "@/pages/Stream";

function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-bold bg-gradient-to-r from-primary to-secondary text-transparent bg-clip-text">
          <Link href="/">React Media Streamer</Link>
        </div>
        
        <nav className="flex items-center space-x-2">
          <Link href="/">
            <div className="text-sm text-gray-600 hover:text-primary flex items-center px-3 py-1.5 rounded-md hover:bg-gray-100 cursor-pointer">
              <Play className="w-4 h-4 mr-1.5" />
              Player
            </div>
          </Link>
          <Link href="/stream">
            <Button size="sm" variant="default">
              <Radio className="w-4 h-4 mr-1.5" />
              Live Stream
            </Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Router() {
  return (
    <>
      <Navbar />
      <div className="pt-14">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/stream" component={Stream} />
          <Route path="/stream/:streamId" component={Stream} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
