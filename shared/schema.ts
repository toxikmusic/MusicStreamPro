import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(), // Added email field
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  profileImageUrl: text("profile_image_url"),
  isStreaming: boolean("is_streaming").default(false),
  followerCount: integer("follower_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  isVerified: boolean("is_verified").default(false), // Added isVerified field
  verificationToken: text("verification_token"), // Added verificationToken field
  verificationTokenExpiry: timestamp("verification_token_expiry") // Added verificationTokenExpiry field
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true, // Added email to the insert schema
  displayName: true,
  bio: true,
  profileImageUrl: true,
  isStreaming: true // Added isStreaming for stream status updates
});

// User Settings model
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  uiColor: text("ui_color").default("#8B5CF6"), // Default purple color
  enableAutoplay: boolean("enable_autoplay").default(true),
  defaultSortType: text("default_sort_type").default("recent"), // Options: recent, popular, etc.
  highContrastMode: boolean("high_contrast_mode").default(false), // Accessibility setting
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).pick({
  userId: true,
  uiColor: true,
  enableAutoplay: true,
  defaultSortType: true,
  highContrastMode: true
});

// Stream model
export const streams = pgTable("streams", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  streamKey: text("stream_key"),   // Stream key for secure broadcasting
  isLive: boolean("is_live").default(false),
  viewerCount: integer("viewer_count").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  category: text("category"),
  tags: text("tags").array(),
  streamType: text("stream_type").default("video"), // "video" or "audio"
  protocol: text("protocol").default("webrtc"), // "webrtc" or "hls"
  useCamera: boolean("use_camera").default(true),
  useMicrophone: boolean("use_microphone").default(true),
  useSystemAudio: boolean("use_system_audio").default(false),
  hasVisualElement: boolean("has_visual_element").default(false),
  visualElementType: text("visual_element_type"), // "image" or "video"
  visualElementUrl: text("visual_element_url"), // URL to uploaded image or video
  hlsPlaylistUrl: text("hls_playlist_url"), // M3U8 playlist URL
  hlsSegmentUrl: text("hls_segment_url"), // Base URL for uploading segments
  hlsFolderPath: text("hls_folder_path"), // Server-side folder where segments are stored
  hasRecording: boolean("has_recording").default(false), // Whether the stream has a VOD recording
  recordingUrl: text("recording_url"), // URL to the VOD recording if available
  peakViewerCount: integer("peak_viewer_count").default(0), // Track peak concurrent viewers
  externalStreamId: text("external_stream_id") // For external streaming services like Cloudflare Stream
});

export const insertStreamSchema = createInsertSchema(streams).pick({
  userId: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  streamKey: true,
  category: true,
  tags: true,
  isLive: true,
  streamType: true,
  protocol: true,
  useCamera: true,
  useMicrophone: true,
  useSystemAudio: true,
  hasVisualElement: true,
  visualElementType: true,
  visualElementUrl: true,
  hlsPlaylistUrl: true,
  hlsSegmentUrl: true,
  hlsFolderPath: true,
  hasRecording: true,
  recordingUrl: true,
  externalStreamId: true
});

// Track model
export const tracks = pgTable("tracks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  artistName: text("artist_name").notNull(),
  coverUrl: text("cover_url"),
  audioUrl: text("audio_url").notNull(),
  duration: integer("duration").notNull(),
  playCount: integer("play_count").default(0),
  likeCount: integer("like_count").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  genre: text("genre")
});

export const insertTrackSchema = createInsertSchema(tracks).pick({
  userId: true,
  title: true,
  artistName: true,
  coverUrl: true,
  audioUrl: true,
  duration: true,
  genre: true
});

// Genre model
export const genres = pgTable("genres", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique()
});

export const insertGenreSchema = createInsertSchema(genres).pick({
  name: true
});

// Follow model (for user following relationships)
export const follows = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followedId: integer("followed_id").notNull()
});

export const insertFollowSchema = createInsertSchema(follows).pick({
  followerId: true,
  followedId: true
});

// Post model (for user's images and text posts)
export const PostType = {
  TEXT: "text",
  IMAGE: "image"
} as const;

export type PostTypeValues = typeof PostType[keyof typeof PostType];

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  likeCount: integer("like_count").default(0),
  commentCount: integer("comment_count").default(0),
  postType: text("post_type").default("text").$type<PostTypeValues>(), // Options: text, image
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  tags: text("tags").array()
});

export const insertPostSchema = createInsertSchema(posts).pick({
  userId: true,
  title: true,
  content: true,
  imageUrl: true,
  postType: true,
  tags: true
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

export type Stream = typeof streams.$inferSelect;
export type InsertStream = z.infer<typeof insertStreamSchema>;

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = z.infer<typeof insertTrackSchema>;

export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;

export type Genre = typeof genres.$inferSelect;
export type InsertGenre = z.infer<typeof insertGenreSchema>;

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = z.infer<typeof insertFollowSchema>;

// Likes model (for tracks and posts)
export const likes = pgTable("likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contentId: integer("content_id").notNull(),
  contentType: text("content_type").notNull(), // "track" or "post"
  createdAt: timestamp("created_at").defaultNow()
});

export const insertLikeSchema = createInsertSchema(likes).pick({
  userId: true,
  contentId: true,
  contentType: true
});

// Comments model (for tracks and posts)
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contentId: integer("content_id").notNull(), 
  contentType: text("content_type").notNull(), // "track" or "post"
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  likeCount: integer("like_count").default(0),
  parentId: integer("parent_id") // For nested comments/replies, null for top-level comments
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  userId: true,
  contentId: true,
  contentType: true,
  text: true,
  parentId: true
});

export type Like = typeof likes.$inferSelect;
export type InsertLike = z.infer<typeof insertLikeSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;