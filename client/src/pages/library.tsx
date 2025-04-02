import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Separator } from '@/components/ui/separator';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import MobileNavigation from '@/components/layout/MobileNavigation';
import AudioPlayer from '@/components/layout/AudioPlayer';
import TrackCard from '@/components/tracks/TrackCard';

import { getRecentTracks } from '@/lib/api';
import { Track } from '@shared/schema';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState('tracks');

  const { data: tracks, isLoading: isLoadingTracks } = useQuery({
    queryKey: ['/api/tracks/recent'],
    queryFn: getRecentTracks
  });

  // Playlist functionality to be implemented
  const playlists = [];
  
  // History functionality to be implemented
  const trackHistory = [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-4 pt-16 pb-20 md:pb-10 lg:pl-72">
          <div className="container max-w-6xl mx-auto pt-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold">Your Library</h1>
              <Button variant="outline">Create Playlist</Button>
            </div>
            
            <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="tracks">Tracks</TabsTrigger>
                <TabsTrigger value="playlists">Playlists</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              
              <TabsContent value="tracks" className="mt-6">
                {isLoadingTracks ? (
                  <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                  </div>
                ) : tracks && tracks.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tracks.map((track) => (
                      <TrackCard key={track.id} track={track} />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground mb-4">You haven't saved any tracks yet.</p>
                      <Button asChild>
                        <Link href="/discover">Discover Tracks</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="playlists" className="mt-6">
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground mb-4">Playlist functionality coming soon.</p>
                    <Button asChild>
                      <Link href="/discover">Browse Tracks</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="history" className="mt-6">
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground mb-4">Listening history feature coming soon.</p>
                    <Button asChild>
                      <Link href="/discover">Discover New Music</Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            
            <Separator className="my-8" />
            
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Recently Played</h2>
              </div>
              
              {isLoadingTracks ? (
                <div className="flex justify-center py-6">
                  <Spinner size="lg" />
                </div>
              ) : tracks && tracks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tracks.slice(0, 3).map((track) => (
                    <TrackCard key={track.id} track={track} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">No recent tracks.</p>
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        </main>
      </div>
      <MobileNavigation />
      <AudioPlayer />
    </div>
  );
}