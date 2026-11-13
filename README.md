# AI Nutrition & Healthy Eating Companion

## Proposed architecture

This project is designed as a premium, mobile-first wellness product with a camera-first scanning experience and an AI coach layer.

### 1) Frontend
- Responsive web app for mobile and desktop
- Camera-first landing flow for returning users
- Dashboard, food history, AI coach, and settings screens
- Local state persistence for demo/testing and eventual API sync

### 2) API and business logic
- Nutrition calculations remain deterministic in backend code
- OCR/vision extraction is handled through a label-processing service
- Recommendation engines use user profile context, goal targets, and food history
- AI is used for explanation, coaching, and natural-language suggestions rather than raw calorie math

### 3) Data layer
- PostgreSQL as the canonical data store
- Supabase for auth, storage, row-level security, and database access
- Private storage for nutrition label images and potential meal photos

### 4) AI integration
- OCR/vision model for label extraction
- OpenAI for coaching prompts and contextual recommendations
- Nutrition database/API to validate food composition instead of inventing values

### 5) Security and privacy
- Secure auth and server-side API key handling
- Row-level security for each user
- Camera consent and explicit image processing permissions
- Consent and deletion workflow for personal health data

## Database schema

The following schema covers the core Phase 1 MVP and the recommended extension points for AI and history tracking.

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age INT,
  sex TEXT,
  height_cm NUMERIC,
  current_weight_kg NUMERIC,
  target_weight_kg NUMERIC,
  activity_level TEXT,
  dietary_preferences TEXT[],
  allergies TEXT[],
  disliked_foods TEXT[],
  eating_goals TEXT[],
  preferred_meal_style TEXT,
  food_budget TEXT,
  snack_preference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nutrition_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_calorie_target INT NOT NULL,
  protein_target_g NUMERIC NOT NULL,
  carbohydrate_target_g NUMERIC NOT NULL,
  fat_target_g NUMERIC NOT NULL,
  fiber_target_g NUMERIC NOT NULL,
  sugar_limit_g NUMERIC,
  sodium_limit_mg NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_name TEXT,
  serving_size NUMERIC,
  serving_unit TEXT,
  calories NUMERIC,
  protein_g NUMERIC,
  carbohydrates_g NUMERIC,
  fat_g NUMERIC,
  fiber_g NUMERIC,
  sugar_g NUMERIC,
  sodium_mg NUMERIC,
  original_label_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE food_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_item_id UUID REFERENCES food_items(id) ON DELETE SET NULL,
  consumed_quantity NUMERIC NOT NULL,
  consumed_unit TEXT,
  total_calories NUMERIC NOT NULL,
  total_protein_g NUMERIC NOT NULL,
  total_carbohydrates_g NUMERIC NOT NULL,
  total_fat_g NUMERIC NOT NULL,
  total_fiber_g NUMERIC,
  total_sugar_g NUMERIC,
  total_sodium_mg NUMERIC,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meal_type TEXT CHECK (meal_type IN ('breakfast','lunch','dinner','snack')),
  source TEXT CHECK (source IN ('camera','manual','history'))
);

CREATE TABLE ai_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recommendation_text TEXT NOT NULL,
  recommended_foods JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles (user_id);
CREATE INDEX idx_nutrition_goals_user_id ON nutrition_goals (user_id);
CREATE INDEX idx_food_items_user_id ON food_items (user_id);
CREATE INDEX idx_food_logs_user_id_consumed_at ON food_logs (user_id, consumed_at DESC);
CREATE INDEX idx_ai_recommendations_user_id ON ai_recommendations (user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Example RLS policy pattern (Supabase-style)
-- CREATE POLICY "Users see only own data"
-- ON food_logs FOR SELECT
-- USING (auth.uid() = user_id);
```

## MVP implementation notes

This repository contains a working front-end prototype that demonstrates the Phase 1 experience:
- onboarding questionnaire
- camera-first scan flow
- nutrition label parsing / editing
- quantity tracking and log entries
- daily nutrition dashboard
- AI recommendation card set
- food history and profile/settings state

It is intentionally built to be easy to run locally and to provide a realistic product feel without requiring an external backend during development.

## Local setup

### Option 1: static local web server
```bash
cd "WIC Team #4 Project"
python3 -m http.server 8000
```
Then visit http://localhost:8000

### Option 2: direct browser open
Open index.html directly in a browser, although some features are more reliable through a local server.

## Production roadmap

### Phase 1: Core MVP
- Authentication
- Onboarding questionnaire
- Goal calculations
- Camera-first scan flow
- OCR and correction screen
- Serving size tracking
- Food log and daily dashboard

### Phase 2: AI Nutrition Coach
- Personalized recommendations
- AI chat assistant
- Remaining-budget suggestions
- Logging of recommended foods

### Phase 3: Advanced analytics and insights
- Portion estimation from photos
- Weekly reporting
- History re-logging
- Ingredient-based meal recommendations

## Important nutrition logic note

This prototype uses realistic sample values and demonstrates deterministic calculations for calories and macro totals. Production implementation should never rely on an LLM to calculate exact nutritional totals; the AI should be used for coaching, explanation, and contextual meal planning while a backend calculator does the math.

## Privacy and safety guidance

- Do not expose API keys in frontend code
- Keep camera permissions explicit and user-managed
- Only send user data to external AI services when needed
- Ensure allergies and restrictions are respected in recommendation logic
- Encourage sustainable, balanced eating and healthcare consultation for medical conditions

