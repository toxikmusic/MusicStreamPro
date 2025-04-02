import fetch from 'node-fetch';

// Get the base URL for the API
const BASE_URL = process.env.REPLIT_URL || 'https://workspace.replit.app';

/**
 * Test deleting a track
 */
async function testDeleteTrack() {
  try {
    console.log("Testing DELETE /api/tracks/:id endpoint");
    
    // Get a track to delete
    const tracksResponse = await fetch(`${BASE_URL}/api/tracks`);
    const tracks = await tracksResponse.json();
    
    if (tracks.length === 0) {
      console.log("No tracks available to test deletion");
      return false;
    }
    
    const trackToDelete = tracks[0];
    console.log(`Found track to delete: ${trackToDelete.id} - ${trackToDelete.title}`);
    
    // Delete the track
    const deleteResponse = await fetch(`${BASE_URL}/api/tracks/${trackToDelete.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const deleteResult = await deleteResponse.json();
    console.log("Delete track response:", deleteResult);
    
    if (deleteResponse.ok) {
      console.log(`✅ Track deleted successfully: ${trackToDelete.id}`);
    } else {
      console.log(`❌ Failed to delete track: ${deleteResponse.status} - ${deleteResult.message}`);
    }
    
    return deleteResponse.ok;
  } catch (error) {
    console.error("Error in testDeleteTrack:", error);
    return false;
  }
}

/**
 * Test deleting a post
 */
async function testDeletePost() {
  try {
    console.log("\nTesting DELETE /api/posts/:id endpoint");
    
    // Get a post to delete
    const postsResponse = await fetch(`${BASE_URL}/api/posts`);
    const posts = await postsResponse.json();
    
    if (posts.length === 0) {
      console.log("No posts available to test deletion");
      return false;
    }
    
    const postToDelete = posts[0];
    console.log(`Found post to delete: ${postToDelete.id} - ${postToDelete.title}`);
    
    // Delete the post
    const deleteResponse = await fetch(`${BASE_URL}/api/posts/${postToDelete.id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const deleteResult = await deleteResponse.json();
    console.log("Delete post response:", deleteResult);
    
    if (deleteResponse.ok) {
      console.log(`✅ Post deleted successfully: ${postToDelete.id}`);
    } else {
      console.log(`❌ Failed to delete post: ${deleteResponse.status} - ${deleteResult.message}`);
    }
    
    return deleteResponse.ok;
  } catch (error) {
    console.error("Error in testDeletePost:", error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("========================================");
  console.log("TESTING DELETE ENDPOINTS");
  console.log("========================================");
  console.log(`Using base URL: ${BASE_URL}`);
  
  // Login first to be authenticated for the tests
  try {
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'toxik',
        password: 'password'
      }),
      credentials: 'include'
    });
    
    if (!loginResponse.ok) {
      console.log("❌ Login failed. Cannot continue with tests.");
      return;
    }
    
    console.log("✅ Login successful");
  } catch (error) {
    console.error("Error logging in:", error);
    console.log("❌ Login failed. Cannot continue with tests.");
    return;
  }
  
  // Run the tests
  const trackResult = await testDeleteTrack();
  const postResult = await testDeletePost();
  
  console.log("\n========================================");
  console.log("TEST RESULTS");
  console.log("========================================");
  console.log(`Delete Track: ${trackResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Delete Post: ${postResult ? '✅ PASS' : '❌ FAIL'}`);
}

// Run the tests
runTests();