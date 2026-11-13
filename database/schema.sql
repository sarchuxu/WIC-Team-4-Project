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

-- Example Supabase policy:
-- CREATE POLICY "Users can access only their own data" ON food_logs
-- FOR ALL USING (auth.uid() = user_id);
