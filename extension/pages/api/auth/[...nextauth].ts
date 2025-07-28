import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import jwt from "jsonwebtoken";

const GH_JWT_SECRET = "4cU5FgYM2rqyWPh1+K9MBcgbyQ4sbx8aF9qHmVpoWh+WXrnwhXNCQmie5/tHgoeQPQkRUPpCZlPIvshBGtA5Wg=="; 
export default NextAuth({
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
    ],
    secret: process.env.NEXT_AUTH_SECRET,
    session: {
        strategy: "jwt", // 👈 Important
    },
    jwt: {
        algorithm: "HS256",
    },
	callbacks: {
        async jwt({ token, account }) {
            // Google: pick up the actual JWT
            if (account?.id_token) {
                token.idToken = account.id_token;
            }
            // Fallback to access_token (e.g. GitHub)
            else if (account?.access_token) {
				token.idToken = jwt.sign(
				{
					sub:    token.sub,
					login:  (token as any).login,
					// you can add any claims here
				},
				GH_JWT_SECRET,
				{
					algorithm: "HS256",
					expiresIn: "1h",
				}
				);
            }
            return token;
        },
        async session({ session, token }) {
            // Expose the real JWT to the client
            (session as any).accessToken = token.idToken ?? token.accessToken;
            // user.id & github_username as before
            (session.user as any).id = token.sub ?? token.email ?? "";
            (session.user as any).github_username = (token as any).login ?? "";
            return session;
        },
	},
    pages: {
        signIn: "/auth/signin",
        error: "/auth/error",
    },
});