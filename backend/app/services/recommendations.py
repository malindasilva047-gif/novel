"""Recommendation engine with category/tag similarity scoring."""
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase


class RecommendationEngine:
    """AI-free recommendation system using internal data analysis."""

    def __init__(self, database: AsyncIOMotorDatabase):
        self.db = database

    async def calculate_category_preference_score(self, user_id: str) -> dict:
        """
        Calculate user's preferred categories using engagement scoring.
        Formula: Total Score = (Views × 1) + (Likes × 3) + (Comments × 4) + (Bookmarks × 5)
        """
        # Get user's activity in the last 90 days
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=90)
        
        activities = await self.db.user_activity.find({
            "user_id": user_id,
            "created_at": {"$gte": cutoff_date}
        }).to_list(None)

        category_scores = {}
        
        for activity in activities:
            category_id = activity.get("category_id")
            if not category_id:
                continue
            
            if category_id not in category_scores:
                category_scores[category_id] = 0
            
            # Apply weighted scoring based on action type
            action_type = activity.get("action_type", "view")
            if action_type == "view":
                category_scores[category_id] += 1
            elif action_type == "like":
                category_scores[category_id] += 3
            elif action_type == "comment":
                category_scores[category_id] += 4
            elif action_type == "bookmark":
                category_scores[category_id] += 5
        
        return category_scores

    async def calculate_trending_score(self) -> dict:
        """
        Calculate trending stories based on last 24 hours of activity.
        Trending Score = (Recent Views × 2) + (Recent Likes × 3) + (Recent Comments × 4)
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(hours=24)
        
        activities = await self.db.user_activity.find({
            "created_at": {"$gte": cutoff_date}
        }).to_list(None)

        post_trending = {}
        
        for activity in activities:
            post_id = activity.get("post_id")
            if not post_id:
                continue
            
            if post_id not in post_trending:
                post_trending[post_id] = 0
            
            action_type = activity.get("action_type", "view")
            if action_type == "view":
                post_trending[post_id] += 2
            elif action_type == "like":
                post_trending[post_id] += 3
            elif action_type == "comment":
                post_trending[post_id] += 4
        
        return post_trending

    async def get_user_tags(self, user_id: str) -> set:
        """Extract tags from user's bookmarks and liked stories."""
        liked_stories = await self.db.likes.find(
            {"user_id": user_id}
        ).to_list(None)
        
        bookmarked_stories = await self.db.bookmarks.find(
            {"user_id": user_id}
        ).to_list(None)
        
        story_ids = set()
        for like in liked_stories:
            story_ids.add(like.get("story_id"))
        for bookmark in bookmarked_stories:
            story_ids.add(bookmark.get("story_id"))
        
        all_tags = set()
        for story_id in story_ids:
            story = await self.db.stories.find_one(
                {"_id": story_id},
                {"tags": 1}
            )
            if story and story.get("tags"):
                tags = story.get("tags", [])
                if isinstance(tags, list):
                    all_tags.update(tags)
                else:
                    all_tags.update(str(tags).split(","))
        
        return all_tags

    async def calculate_content_similarity(self, story_id: str, limit: int = 12) -> list:
        """
        Suggest stories with matching category or tags.
        Higher engagement = higher rank.
        """
        source_story = await self.db.stories.find_one({"_id": story_id})
        if not source_story:
            return []
        
        source_categories = source_story.get("categories", []) or []
        source_tags = source_story.get("tags", []) or []
        
        # Find similar stories
        query = {
            "_id": {"$ne": story_id},
            "status": "published",
            "$or": [
                {"categories": {"$in": source_categories}} if source_categories else {},
                {"tags": {"$in": source_tags}} if source_tags else {},
            ]
        }
        
        # Remove empty clauses
        if "$or" in query:
            query["$or"] = [clause for clause in query["$or"] if clause]
        
        similar_stories = await self.db.stories.find(query).sort([
            ("likes", -1),
            ("views", -1),
            ("created_at", -1)
        ]).limit(limit).to_list(None)
        
        return similar_stories

    async def get_recommendations_for_user(
        self, 
        user_id: str, 
        limit: int = 12
    ) -> list:
        """
        Final weighted ranking for "Recommended for You" section.
        Formula: Final Score = (40% Category Preference) + (30% Tag Similarity) + (30% Trending Score)
        """
        # Get user's preferences
        category_scores = await self.calculate_category_preference_score(user_id)
        user_tags = await self.get_user_tags(user_id)
        trending_scores = await self.calculate_trending_score()
        
        # Get all published stories
        all_stories = await self.db.stories.find({
            "status": "published"
        }).to_list(None)
        
        # Score each story
        story_scores = {}
        for story in all_stories:
            story_id = story.get("_id")
            
            # Check if user already interacted with this story
            user_interaction = await self.db.reading_history.find_one({
                "user_id": user_id,
                "story_id": story_id
            })
            if user_interaction:
                continue  # Skip stories user has already started reading
            
            category_score = 0
            story_categories = story.get("categories", []) or []
            for category in story_categories:
                category_score += category_scores.get(category, 0)
            
            # Normalize category score (40% weight)
            max_category_score = max(category_scores.values()) if category_scores else 1
            category_weight = (category_score / max_category_score * 40) if max_category_score > 0 else 0
            
            # Tag similarity score (30% weight)
            story_tags = set(story.get("tags", []) or [])
            tag_overlap = len(user_tags & story_tags)
            tag_weight = (tag_overlap / max(len(user_tags), 1)) * 30
            
            # Trending score (30% weight)
            trending_score = trending_scores.get(story_id, 0)
            max_trending = max(trending_scores.values()) if trending_scores else 1
            trending_weight = (trending_score / max_trending * 30) if max_trending > 0 else 0
            
            # Final score
            final_score = category_weight + tag_weight + trending_weight
            story_scores[story_id] = {
                "score": final_score,
                "story": story
            }
        
        # Sort by score and return top recommendations
        sorted_recs = sorted(
            story_scores.items(),
            key=lambda x: x[1]["score"],
            reverse=True
        )
        
        return [item[1]["story"] for item in sorted_recs[:limit]]

    async def get_trending_stories(self, limit: int = 12) -> list:
        """Get stories trending in the last 24 hours."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(hours=24)
        
        pipeline = [
            {
                "$match": {
                    "created_at": {"$gte": cutoff_date}
                }
            },
            {
                "$group": {
                    "_id": "$post_id",
                    "score": {
                        "$sum": {
                            "$cond": [{"$eq": ["$action_type", "view"]}, 2, 0]
                        }
                    },
                    "likes": {
                        "$sum": {
                            "$cond": [{"$eq": ["$action_type", "like"]}, 1, 0]
                        }
                    },
                    "comments": {
                        "$sum": {
                            "$cond": [{"$eq": ["$action_type", "comment"]}, 1, 0]
                        }
                    }
                }
            },
            {"$sort": {"score": -1}},
            {"$limit": limit}
        ]
        
        trending_post_ids = await self.db.user_activity.aggregate(pipeline).to_list(None)
        post_ids = [item["_id"] for item in trending_post_ids]
        
        if not post_ids:
            # Fallback to recently published high-engagement stories
            return await self.db.stories.find({
                "status": "published"
            }).sort([
                ("likes", -1),
                ("views", -1),
                ("created_at", -1)
            ]).limit(limit).to_list(None)
        
        trending_stories = await self.db.stories.find({
            "_id": {"$in": post_ids}
        }).to_list(None)
        
        return trending_stories

    async def track_user_activity(
        self,
        user_id: str,
        post_id: str,
        category_id: str,
        action_type: str,
        tags: list | None = None,
        read_time: int = 0,
        scroll_depth: float = 0.0
    ) -> None:
        """Record user activity for recommendations tracking."""
        activity = {
            "_id": f"{user_id}_{post_id}_{action_type}_{datetime.now(timezone.utc).timestamp()}",
            "user_id": user_id,
            "post_id": post_id,
            "category_id": category_id,
            "tags": tags or [],
            "action_type": action_type,
            "read_time": read_time,
            "scroll_depth": scroll_depth,
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.db.user_activity.insert_one(activity)
