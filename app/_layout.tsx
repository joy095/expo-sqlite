// app/_layout.tsx
import { DATABASE_NAME } from "@/db/client";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { Suspense } from "react";
import { ActivityIndicator } from "react-native";
import migrations from "../drizzle/migrations/migrations";

async function migrateDatabase(database: any) {
  const db = drizzle(database);
  await migrate(db, migrations);
  console.log("Migration success");
}

export default function RootLayout() {
  return (
    <Suspense fallback={<ActivityIndicator size="large" />}>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        options={{ enableChangeListener: true }}
        onInit={migrateDatabase}
      >
        <Stack>
          <Stack.Screen name="index" options={{ title: "Todos" }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
