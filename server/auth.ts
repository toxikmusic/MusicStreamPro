import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "beatstream-secret-key",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false,  // Set to false to work in development
      httpOnly: true, // Prevents client-side JS from reading the cookie
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax' // Allows cookies to be sent in top-level navigations
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        
        if (!user) {
          console.log(`User with username ${username} not found`);
          return done(null, false);
        }

        // For demo accounts and development, allow direct comparison with plaintext passwords
        // In production, this would only use the secure password comparison
        if (user.password === password) {
          console.log(`User ${username} authenticated with plaintext password`);
          return done(null, user);
        } else if (await comparePasswords(password, user.password)) {
          console.log(`User ${username} authenticated with hashed password`);
          return done(null, user);
        } else {
          console.log(`Invalid password for user ${username}`);
          return done(null, false);
        }
      } catch (error) {
        console.error(`Authentication error:`, error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      // Automatically create default user settings for the new user
      await storage.createUserSettings({
        userId: user.id,
        uiColor: "#7c3aed", // Default purple theme
        enableAutoplay: true,
        defaultSortType: "recent"
      });

      req.login(user, (err) => {
        if (err) return next(err);
        // Send user without password
        const { password, ...userWithoutPassword } = user;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Login attempt with username:", req.body.username);
    
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: { message: string }) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }
      
      if (!user) {
        console.log("Login failed: Invalid credentials");
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      console.log("Authentication successful for user:", user.id);
      
      req.login(user, (err: Error | null) => {
        if (err) {
          console.error("Session creation error:", err);
          return next(err);
        }
        
        // Log session information
        console.log("Session established:", {
          id: req.sessionID,
          cookie: req.session.cookie,
          user: user.id
        });
        
        // Send user without password
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(200).json({ message: "Not logged in" });
    }
    
    req.logout((err: Error | null) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('connect.sid');
        res.status(200).json({ message: "Logged out successfully" });
      });
    });
  });

  app.get("/api/user", (req, res) => {
    console.log("GET /api/user session:", {
      id: req.sessionID,
      authenticated: req.isAuthenticated(),
      user: req.user ? (req.user as SelectUser).id : 'none'
    });
    
    if (!req.isAuthenticated()) {
      console.log("GET /api/user - Not authenticated");
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    console.log("GET /api/user - Authenticated user:", (req.user as SelectUser).id);
    
    // Send user without password
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });
}