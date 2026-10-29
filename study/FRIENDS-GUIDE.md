# Study Desk: setting it up on your laptop

Study Desk is a study app for KU engineering units. It runs on your own laptop, keeps your study data there, and links to the Study Hub for past papers, notes and Discord.

It tells you what to study today, which pages of your notes to read, and which past-paper questions to try. When you check an answer, it shows the exact step where your working went wrong.

You need: a Windows 10 or 11 laptop, an internet connection, a Study Desk code, and a Discord account in the Study Hub server.

---

## 1. Get your code

You need a **Study Desk code**, which looks like `SD-7K2M-9QXA`. Get it one of two ways:

- **From the person who invited you.** They send you the download link and your code.
- **Premium members:** in the Study Hub Discord, type `/study link`. The bot replies with your code, visible only to you.

A code works once. If something goes wrong, ask for a new one (or run `/study link` again).

## 2. Download and install

1. Open the download link and download **StudyDesk.exe** (about 90 MB).
2. Double-click it. Windows will probably say **"Windows protected your PC"**, because the app is new and not signed by a company. Click **More info**, then **Run anyway**.
3. Click **Yes** to install. It installs to your own user folder: no admin password is needed, and nothing else on your laptop changes.
4. A **Study Desk** shortcut appears on your desktop and in the Start menu, and setup starts on its own.

## 3. Setup (about 2 minutes)

Setup asks four things in a black window:

1. **Your Study Desk code.** Paste it and press Enter. It says "Linked. Welcome, <your name>."
2. **Which AI to use.** The AI writes study kits, checks answers step by step, marks your explanations and reads photos and voice notes. Pick one:
   - **1 · The Study Hub's AI.** Nothing to set up. It's **free for now** with a daily allowance (setup tells you how many actions a day). See "About cost" below.
   - **2 · Your own Gemini key.** Free from Google, and no daily limit from the Study Hub. Best if you study a lot. Get one at **aistudio.google.com → Get API key**, copy it, and paste it when setup asks. You'll see `*` as you paste, which is normal. Setup checks it works.
   - **3 · Your own DeepSeek key** (paid by you, very cheap) or **4 · Claude** (paid by you). DeepSeek can't read photos or voice; Claude can't read voice.
3. **The dashboard port.** Press Enter to keep 5190.
4. **Connect Discord?** Press Enter for yes. Setup shows a line like `/study connect code:482913`. In the Study Hub Discord (or a DM with the bot), type exactly that within 15 minutes.

Your keys and settings are saved in a file on your laptop only. Nobody else sees them, and the Study Hub never asks for them.

To change your code, AI key or port later, run **Study Desk setup** from the Start menu. To switch which AI you use, open **Settings** (the sliders icon, top right).

## 4. Every day

1. Open **Study Desk** from the desktop. A black window opens (keep it open while you study) and the dashboard opens in your browser.
2. The first time, a small panel at the bottom left gives you short tasks one at a time: pick your units, set your dates, sync your files, check an answer. Each one completes when you've done it.
3. After that, open **Today** and do task 1.

**Close the black window** to stop Study Desk. Your data is saved as you go.

## 5. Discord

Once Discord is connected, while Study Desk is open on your laptop:

| Type | What you get |
|---|---|
| `/study today` | today's plan |
| `/study learn unit:EMM 302 topic:torsion` | which pages of your notes to read, worked examples, then questions |
| `/study mark unit:EMM 302` | a past-paper question to try |
| `/study mark unit:EMM 302 answer:142.5 MPa` | checks your answer (or attach a **photo** of your working) |
| `/study broke step:3` | the step where your working broke |
| `/study teach unit:EMM 302 topic:torsion` | explain a topic and get it marked: type it, or attach a **voice note** |
| `/study predict unit:EMM 302` / `/study weakspots unit:EMM 302` | likely topics / your weak spots |

You also get your plan as a DM at 07:00 and a reminder at 20:30 if you haven't studied that day.

If Study Desk isn't open, the bot tells you, and you get the answer as a DM the next time you start it.

## 6. About cost

- **Study Desk is free.** Your study data stays on your laptop.
- **With your own AI key**, you pay your AI provider directly, if anything. Gemini has a free allowance that covers normal studying.
- **With the Study Hub's AI**, it's **free for now**, with a daily allowance. Later it may become part of the **Study Hub Premium** plan. If that happens, you'll be told in Discord first, nothing is charged without you choosing it, and you can switch to your own free Gemini key at any time in **Settings** (the sliders icon, top right).
- The Study Hub counts how many AI actions each person uses a day, only to keep the allowance fair.

## 7. Updating

When there's a new version, download the new **StudyDesk.exe** and run it the same way. Your study data and settings are kept.

## 8. If something goes wrong

- **"Windows protected your PC"**: click **More info → Run anyway**. It shows because the app isn't signed by a company.
- **"That code isn't valid"**: codes work once. Ask for a new one, or use `/study link` if you have Premium.
- **The dashboard doesn't open**: make sure the black window is open, then go to `http://localhost:5190` in your browser.
- **"You've used today's free AI actions"**: they reset at midnight (Nairobi time), or add your own free Gemini key in setup.
- **`/study` says your Study Desk isn't open**: start Study Desk; the answer comes as a DM.
- **Something else**: ask in the Study Hub server, and include what the black window says.
