import os
import json
import asyncio
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from telethon.tl.types import KeyboardButtonCallback

# ----------------------------------------------------------------
# Read API ID & hash from Replit secrets (environment variables)
api_id   = '766935295b488f5bd8e2d19c79fdf85a'
api_hash = '766935295b488f5bd8e2d19c79fdf85a'
# Replace this with your saved session string (you can also store it in a secret if you like):
SESSION_STRING = '1AZWarzgBu1xg1S9oXM6badiCudJ0Dt4oUZvhfy5kcBCECh4od19ZVxtouvn8XtmVsJnDFSUtfAi65D_dqCBjV4h_omIUbaav7BPoAIxbK1a5jsfec4lvdE3iolyVb9sEMQpMOpseVJtAaB6hYhTIiT4nqSgIVkbLjL9oZtfytaTPcsV9a0RZHsRGSpDIGEYl3t0rF091f4iaeECfMo42RZFvM8uFyBZUYSz7-K1wQgEet4d7t7OPuLdr4jmkYCrLQyUhiT_-vIqj2h1Ue6EixPVVe1TH_BVRIKFbTzKgCL297jwaa_2CvNzzwsWuCRfytqLt9X1mV6zp077V0jVGdPwr7Os5IDM='
# ----------------------------------------------------------------

# ----------------------------------------------------------------
client = TelegramClient(StringSession(SESSION_STRING), api_id, api_hash)

# Bot usernames (no “@” prefix)
SOURCE_BOT   = 'pwjarvisbot'
RECEIVER_BOT = 'testisha_bot'

# Load batch data from JSON (expects { "batches": { "Title": … } })
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
batch_titles = list(data.get('batches', {}).keys())

# Global event to signal when .sh is received
sh_received = asyncio.Event()

# -----------------------------------------------------------------------------
# Exact button texts to click, in order:
BUTTON_FLOW = [
    "❇️ Continue Extraction",   # Level 1: callback button
    "Full Batch",               # Level 2: inline button
    "Lectures",                 # Level 3: inline button
    "Notes",                    # Level 3: inline button
    "DPP Notes",                # Level 3: inline button
    "✅ Done",                   # Level 3: callback button
    "720p",                     # Level 4: inline button
    "Mobile (Termux/Linux)",    # Level 5: inline button
]
# -----------------------------------------------------------------------------

def slugify(title: str) -> str:
    """
    Convert a batch title like "Safar -सफर- 2026 SSC CGL - CHSL Complete Foundation Batch with Test Series"
    into a slug like "safar--सफर--2026-ssc-cgl--chsl-complete-foundation-batch-with-test-series"
    by replacing spaces, dots, underscores, plus signs, and certain symbols like "|" with hyphens.
    """
    s = title.lower()

    # Replace specific characters with hyphens
    for ch in [' ', '.', '_', '+']:
        s = s.replace(ch, '-')

    # Handle special characters like "|"
    s = s.replace('|', '-')

    # Remove leading/trailing hyphens that may appear after replacement
    s = s.strip('-')

    return s

async def find_and_click_callback(label: str, min_id: int) -> bool:
    """
    Fetch messages from SOURCE_BOT with id > min_id.
    If any has a KeyboardButtonCallback whose text contains `label`, click it.
    """
    msgs = await client.get_messages(SOURCE_BOT, limit=5, min_id=min_id)
    for msg in msgs:
        rm = msg.reply_markup
        if rm and hasattr(rm, 'rows'):
            for row in rm.rows:
                for btn in row.buttons:
                    if isinstance(btn, KeyboardButtonCallback) and label.strip().lower() in btn.text.strip().lower():
                        await msg.click(text=btn.text)
                        print(f"[🖱️] Clicked callback '{btn.text}' (msg id={msg.id}).")
                        await asyncio.sleep(0.3)
                        return True
    return False

async def find_and_click_inline(label: str, min_id: int) -> bool:
    """
    Fetch messages from SOURCE_BOT with id > min_id.
    If any has inline buttons whose text contains `label`, click that button.
    """
    msgs = await client.get_messages(SOURCE_BOT, limit=5, min_id=min_id)
    for msg in msgs:
        for row in msg.buttons or []:
            for btn in row:
                if label.strip().lower() in btn.text.strip().lower():
                    await msg.click(text=btn.text)
                    print(f"[🖱️] Clicked inline '{btn.text}' (msg id={msg.id}).")
                    await asyncio.sleep(0.3)
                    return True
    return False

async def click_through_flow(min_id: int) -> bool:
    """
    After ‘Continue Extraction’ is clicked, navigate through BUTTON_FLOW[1:],
    only considering messages with id > min_id. Returns False on failure.
    """
    for label in BUTTON_FLOW[1:]:
        clicked = False

        # Try callback buttons first
        clicked = await find_and_click_callback(label, min_id)
        if clicked:
            continue

        # Then try inline buttons
        clicked = await find_and_click_inline(label, min_id)
        if clicked:
            continue

        # Retry up to 2 times with short waits
        for _ in range(2):
            await asyncio.sleep(0.5)
            clicked = await find_and_click_callback(label, min_id)
            if clicked:
                break
            clicked = await find_and_click_inline(label, min_id)
            if clicked:
                break

        if not clicked:
            print(f"[⚠️] Failed to click '{label}' after attempts.")
            return False

    return True

async def process_single_batch(batch_title: str):
    global sh_received
    print(f"\n[📨] Processing batch title: {batch_title}")

    # Convert to bot‐required slug
    batch_slug = slugify(batch_title)
    print(f"[🔗] Using slug: {batch_slug}")

    # 1) Record the latest message ID from SOURCE_BOT
    last_msg = await client.get_messages(SOURCE_BOT, limit=1)
    min_id = last_msg[0].id if last_msg else 0

    # 2) Inline‐query and click the first result
    src_entity = await client.get_entity(SOURCE_BOT)
    try:
        results = await client.inline_query(SOURCE_BOT, batch_slug)
        if not results:
            print(f"[⚠️] No inline result for slug: {batch_slug}. Skipping batch.")
            return
        await results[0].click(entity=src_entity)
        print(f"[✅] Selected inline result for slug: {batch_slug}")
    except Exception as e:
        print(f"[❌] Inline query failed for slug {batch_slug}: {e}")
        return

    # 3) Wait briefly, then click "❇️ Continue Extraction" only among new messages
    await asyncio.sleep(0.5)
    found = await find_and_click_callback(BUTTON_FLOW[0], min_id)
    if not found:
        found = await find_and_click_inline(BUTTON_FLOW[0], min_id)

    if not found:
        print("[⚠️] '❇️ Continue Extraction' not found for this batch. Aborting.")
        return

    print("[✅] Clicked ‘❇️ Continue Extraction’. Continuing navigation…")

    # 4) Click through the rest of the flow using the same min_id
    ok = await click_through_flow(min_id)
    if not ok:
        print(f"[⚠️] Aborting batch '{batch_title}' due to missing submenu buttons.")
        return

    # 5) Wait for the .sh file (forwarded by handle_sh)
    try:
        await asyncio.wait_for(sh_received.wait(), timeout=60)
    except asyncio.TimeoutError:
        print(f"[⏱️] Timeout: No .sh file received for '{batch_title}'.")

@client.on(events.NewMessage(from_users=SOURCE_BOT))
async def handle_sh(event):
    """
    Whenever a .sh file arrives from SOURCE_BOT, forward it to RECEIVER_BOT
    and signal sh_received.
    """
    global sh_received
    if event.file and event.file.name.endswith('.sh'):
        print(f"[📥] Received .sh file, forwarding…")
        await client.forward_messages(RECEIVER_BOT, event.message)
        print(f"[➡️] Forwarded .sh to: {RECEIVER_BOT}")
        sh_received.set()

async def main():
    await client.start()
    print("[🔓] Logged in. Starting batch processing…")

    for title in batch_titles:
        sh_received.clear()
        await process_single_batch(title)

        # Wait a bit before next batch
        print("[⏳] Waiting 5 seconds before next batch…\n")
        await asyncio.sleep(5)

    print("[🏁] All batches done. Disconnecting.")
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
