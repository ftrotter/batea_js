spade
============

Initial DocGraph Spade extension implementation. "chrome" folder contains chrome extension source code.


Chrome extension processes user vistis to find session wiht clinical urls in two ways:

1.	It processes entire visits history (VisitProcessor.findNewVisits() function). To speed up processing 
	extension checks only newly added items since last check. It also igrnoes sessions that are already 
	processed.

2.	It handles user interactions with the browser using 3 main events:
	chrome.history.onVisited
	chrome.tabs.onUpdated
	chrome.tabs.onRemoved
   
   onUpdated calls save url information about user navigations. Event handler erases a previous tab information
   to prevent wrong url association if user navigates to the same url again.

   onVisited calls associate visit with tab by url. It checks for clinical url and update tab icon based on session state

   onRemove calls check if associated session for closed tab is completed (no more tabs associated with the session)

   If extension determines session is completed then it checks for ites state (donatable, excluded or undefined). Both 
   donatable and excluded session saved to localStorage to prevent possible duplicate processing by furhter calls
