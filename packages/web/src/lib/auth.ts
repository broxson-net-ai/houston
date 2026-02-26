import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@houston/shared";

export async function authorize(
  credentials: { email?: string; password?: string } | undefined
): Promise<{ id: string; email: string } | null> {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: credentials.email },
  });

  if (!user) {
    return null;
  }

  const passwordMatch = await bcrypt.compare(
    credentials.password,
    user.passwordHash
  );

  if (!passwordMatch) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};
