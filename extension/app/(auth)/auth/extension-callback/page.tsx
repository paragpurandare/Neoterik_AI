'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function ExtensionCallback() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const [messageSent, setMessageSent] = useState(false)

    useEffect(() => {
        if (status === 'authenticated' && session && !messageSent) {
            console.log('Extension callback: Session authenticated, sending to extension', session)

            // Change the page title to signal success to the background script
            // document.title = "AUTH_SUCCESS";

            // // Method 1: Direct postMessage to parent (works when opened in a popup)
            // try {
            //   if (window.opener) {
            //     window.opener.postMessage(
            //       {
            //         type: 'EXTENSION_AUTH_SUCCESS',
            //         session: {
            //           user: session.user,
            //         }
            //       },
            //       '*'
            //     );
            //     console.log("Message posted to opener window");
            //   } else {
            //     console.log("No opener window found, trying broadcast");
            //   }
            // } catch (e) {
            //   console.error("Failed to post message to opener:", e);
            // }

            // // Method 2: Broadcast message (works when opened in tab)
            // try {
            //   window.postMessage(
            //     {
            //       type: 'EXTENSION_AUTH_SUCCESS',
            //       session: {
            //         user: session.user,
            //       }
            //     },
            //     '*'
            //   );
            //   console.log("Broadcast message posted");
            // } catch (e) {
            //   console.error("Failed to broadcast message:", e);
            // }

            // Set flag to prevent multiple messages
            setMessageSent(true);
            const callbackUrl = '/';
            const urlParams = new URLSearchParams(window.location.search);
            const source = urlParams.get('source');

            // Show success message
            document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <h1 style="color:#419D78;">Successfully signed in!</h1>
          <p>${window.opener ? "You can close this window now." : "Redirecting to home page..."}</p>
          <p>Signed in as: ${session.user?.name || session.user?.email}</p>
        </div>`;

            // If popup, close after 3 seconds; if tab, redirect to home page after 3 seconds
            // Close the window only if it came from the extension
            setTimeout(() => {
                if (source === 'extension') {
                    window.close();
                } else {
                    // For normal browser sign-ins, redirect to the home page
                    router.replace('/');
                }
            }, 2000); // 2-second delay
        } else if (status === "authenticated") {
            router.replace("/"); // Redirect to home page if already authenticated
        }
    }, [session, status, messageSent, router]);

    if (status === 'loading') return <div>Loading session...</div>
    if (status === 'unauthenticated') return <div>Authentication failed</div>

    return <div>Authenticating...</div>
}