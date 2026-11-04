# Quest progression and beginner guidance overhaul (owner brief, verbatim)

PRIMAL: FIRST FIRE — COMPLETE QUEST PROGRESSION AND BEGINNER GUIDANCE OVERHAUL
You are working directly inside the existing PRIMAL: First Fire repository.
Your task is to significantly improve the game's onboarding, quest progression, instructional clarity, objective system and hint system.
The primary problem is that a completely new player currently encounters multiple quests simultaneously, without understanding which one to complete first or what actions are expected.
This creates unnecessary confusion and makes the game difficult to approach for someone who has never played a VR survival game.
We need to redesign the experience so that a new player is guided naturally through the game, learning one mechanic at a time.
IMPORTANT:
This is an improvement to the existing game, NOT a request to create a new quest system from scratch.
First inspect the existing quest architecture, quest definitions, objective tracking, hint system, notebook, science roadmap and UI components.
Reuse existing systems wherever possible.
Do not break existing quest progression, science discoveries, XP, save states or gameplay mechanics.
Do not redesign unrelated graphics or environmental systems.
The player should NEVER be presented with several unrelated objectives at the beginning of the game.
Introduce a strictly sequential progression system for the initial survival experience.
The player should receive:

1. One primary objective.
2. A short, understandable instruction.
3. A visual reference showing what they need to find or interact with.
4. Optional hints.
5. Immediate feedback when they make progress.
6. A clear completion message.
7. The next objective only when the current objective is complete.

Do not overwhelm beginners with future objectives.
The player should discover the game progressively.
The objective system should act like an experienced survival guide teaching someone how to survive in the wilderness.
Do not make it feel like a list of assignments.
The existing floating quest card is too intrusive and presents too much information.
Redesign it into a compact objective card positioned at the TOP of the player's view.
POSITIONING:

* Keep it near the upper edge of the player's field of view.
* It must not obstruct the central gameplay view.
* Keep it compact.
* Avoid occupying a large percentage of the screen.
* Maintain comfortable readability.
* Ensure it remains readable when the player looks around.
* Avoid excessive distance from the player.
* Keep it stable rather than allowing it to jitter with head movement.

The card should display:
OBJECTIVE TITLE:
A short, clear action-oriented title.
INSTRUCTION:
One or two short sentences explaining exactly what the player should do.
PROGRESS:
Show progress where relevant.
For example:
Collect stones
1 / 3
OPTIONAL HINT INDICATOR:
A small icon that opens the hint interface.
CARD CONTROLS:
Add the ability to close and reopen the card.
When closed:

* Remove the objective card from the player's view.
* Do not pause or interrupt gameplay.
* Continue tracking objective progress.
* Keep the objective active internally.

Provide an accessible way to reopen it using the existing VR interaction mechanisms.
The player should not need a controller.
The card can be reopened through an appropriate bottom-screen UI icon or existing interaction interface.
When reopened:

* Display the current objective.
* Display the latest progress.
* Preserve the current state.

Do not reset the quest when closing the card.
Do not automatically reopen it after every minor interaction.
This is the most important change.
Redesign the initial survival progression into the following sequence.
OBJECTIVE 1 — COLLECT YOUR FIRST STONE
Title:
Find your first stone.
Instruction:
Look around the forest floor and pick up one suitable stone.
Visual reference:
Display a clear picture of a small natural stone.
Completion condition:
Player successfully collects one stone.
Important:
Do not display the next objective until this objective is complete.
When completed:

* Show a small completion animation.
* Play a subtle success sound.
* Display a short message such as "Good. You've found your first resource."
* Introduce the next objective.

OBJECTIVE 2 — COLLECT THREE STONES
Title:
Gather more stones.
Instruction:
Find three additional stones. You will need them to build your first workbench.
Visual reference:
Display three natural stones.
Progress:
0 / 3, 1 / 3, 2 / 3, 3 / 3.
Completion condition:
The player collects the required three stones.
Do not count the previous objective's stone unless the existing crafting requirements explicitly require a total of three.
Ensure the displayed quantity matches the actual resource requirement.
When completed:
Explain briefly why multiple stones are useful.
OBJECTIVE 3 — FIND A FLAT STONE
Title:
Find a flat stone.
Instruction:
Look for a broad, relatively flat stone that can serve as the surface of your first workbench.
Visual reference:
Show a clear image of a suitable flat stone.
Explain what makes it different from the smaller stones.
Completion condition:
The player collects or identifies a suitable flat stone according to the existing item system.
Do not accept any arbitrary stone as a flat workbench surface.
OBJECTIVE 4 — BUILD YOUR FIRST WORKBENCH
Title:
Build your first workbench.
Instruction:
Use the stones you collected to create a stable base. Place the flat stone on top to complete your workbench.
Visual reference:
Display a completed primitive stone workbench.
Break the task into understandable stages.
For example:

1. Find a suitable location.
2. Position the supporting stones.
3. Check that the supports are stable.
4. Lift the flat stone.
5. Position it on the supports.
6. Release it when correctly aligned.

Use the existing blueprint and snap-point system.
Do not introduce an entirely separate construction system.
Provide immediate feedback when the player places a component correctly.
If placement is incorrect, explain why.
Examples:

* The support is too far away.
* The surface is not stable.
* The slab needs to be positioned above the supports.

Completion condition:
The existing workbench construction system confirms that the workbench is complete.
OBJECTIVE 5 — DISCOVER THE WORKBENCH
Title:
Explore your workbench.
Instruction:
Now that you have built your first workbench, discover what you can create using it.
Introduce the next appropriate existing crafting activity.
Do not immediately show all recipes.
Teach one crafting interaction at a time.
Continue the progression naturally through the existing survival storyline.
Implement a clear active-objective state.
The initial survival tutorial must only display one primary objective at any given time.
Do not display five active quest cards.
Future objectives should remain hidden until unlocked.
When the current objective is complete:

1. Verify the completion condition.
2. Update the quest state.
3. Save the progress.
4. Display completion feedback.
5. Unlock the next objective.
6. Update the objective card.
7. Explain the new task.

Avoid immediately replacing the objective without giving the player a moment to recognise their achievement.
Use a short transition.
The player should always understand:

* What they are doing.
* Why they are doing it.
* What happens next.

IMPORTANT:
Some quests may have multiple internal conditions.
These should appear as substeps of the current objective rather than separate simultaneous quest cards.
For example, building a workbench can have multiple construction stages while still being one primary objective.
The existing hint system should become much more useful for beginners.
The current problem is that text instructions alone do not adequately explain what objects the player needs to find.
Introduce IMAGE-BASED HINTS.
Every objective involving an object should have an appropriate visual reference.
Examples:
Find a stone:
Display an image of a small natural stone.
Find three stones:
Display an image showing three suitable stones.
Find a flat stone:
Display a broad flat rock with a clear silhouette.
Build a workbench:
Display the completed workbench and, when useful, its individual components.
Find dry grass:
Display dry grass and distinguish it from green vegetation.
Find suitable wood:
Display examples of the relevant wood types.
Find flint:
Show a recognisable flint nodule and explain its visual characteristics.
Find bark:
Show the material on a tree.
IMAGE REQUIREMENTS:

* Images should be large enough to recognise the object.
* Use clear, realistic reference pictures or suitable existing game assets.
* Avoid generic unrelated stock imagery.
* Prefer the actual in-game object model or a faithful image of it.
* Maintain consistent visual presentation.
* Use a transparent or neutral background when appropriate.
* Include a short descriptive label.
* Show the important characteristics of the object.

If a suitable image does not exist:
Create an appropriate illustration or render using existing game assets.
Do not invent paths to assets.
Do not leave broken image references.
Do not display an image of an item that does not match the actual collectible.
Introduce progressive hints.
The player should not receive the complete solution immediately.
HINT LEVEL 1 — IDENTIFICATION
Explain what the player should look for.
Example:
"Look for a small, hard object lying on the forest floor."
Show the reference image.
HINT LEVEL 2 — VISUAL CHARACTERISTICS
Provide more specific identification.
Example:
"Look for a grey or brown stone with a solid surface. Avoid loose leaves and soil."
Show a closer reference image.
HINT LEVEL 3 — LOCATION GUIDANCE
Provide a useful environmental clue.
Example:
"Try looking near the exposed ground around the larger trees."
Only provide location hints when the environment supports them.
HINT LEVEL 4 — ACTION INSTRUCTIONS
Explain exactly how to complete the task.
Example:
"Approach the stone, pinch to grab it, and release it into your satchel."
Do not reveal the highest-level hint automatically.
The player should request additional help when needed.
The game should teach players to recognise objects visually.
When the player opens a hint:

* Show the object reference image.
* Display its name.
* Explain its important characteristics.
* Explain what it will be used for.

For example:
FLAT STONE
What to look for:
A relatively broad, flat piece of stone with a stable surface.
Why you need it:
It will become the top surface of your first workbench.
Avoid:
Small rounded stones that cannot support a work surface.
Use actual game item properties when deciding whether an object is suitable.
Do not tell the player that every flat-looking rock is usable if the existing item definitions do not support that.
Improve the wording of all instructions.
Avoid technical or vague instructions.
BAD:
"Acquire resources."
GOOD:
"Pick up one stone from the ground."
BAD:
"Complete the workbench blueprint."
GOOD:
"Place the flat stone on top of the three supporting stones."
BAD:
"Interact with the resource."
GOOD:
"Move closer, pinch the stone to pick it up, and release it when you are ready to put it down."
Use simple language that someone with no gaming experience can understand.
Explain unfamiliar gameplay mechanics the first time they appear.
Do not repeatedly explain mechanics the player has already learned unless they request help.
Introduce controls contextually.
For example:
FIRST STONE:
Teach the player how to approach and grab an object.
FIRST PLACEMENT:
Teach them how to lower an object and release it naturally.
FIRST WORKBENCH:
Teach them how to position components and use the construction system.
FIRST TOOL:
Teach them how to hold and use a tool.
FIRST FIRE:
Teach them how to prepare tinder and operate the bow drill.
Do not display a giant tutorial explaining every possible gesture at the beginning.
Teach one interaction at a time.
Use small visual diagrams or hand illustrations where necessary.
Once the player successfully performs an action, mark that interaction as learned.
Completion should feel satisfying.
When an objective is completed:

* Briefly highlight the objective card.
* Display a completion checkmark.
* Play a subtle success sound.
* Display a short contextual message.
* Update progress.
* Unlock the next objective.

Examples:
"Excellent! You found your first stone."
"Great! You have enough stones to begin building."
"That looks like a suitable flat stone."
"Your first workbench is ready!"
Avoid excessive animations or lengthy messages that interrupt gameplay.
The player should feel rewarded without being pulled out of the experience.
Keep the main objective card and hint system separate.
The objective card should remain compact.
When the player selects the hint icon:
Open a larger, readable hint panel.
The hint panel should display:

* Objective name.
* Reference image.
* Short description.
* What to look for.
* What to do.
* Available hint level.
* Close control.

The player should be able to close the hint panel and return to gameplay immediately.
Do not leave the large hint panel permanently visible.
All controls must support hands-only interaction.
Use direct fingertip tapping for UI interactions.
Do not require controller buttons or pinch gestures to operate the hint interface.
Preserve the existing science-first survival storyline.
Do not remove existing quests.
Reorganise the existing quests into a sensible progression.
Potential sequence:

1. Collect first stone.
2. Gather additional stones.
3. Find flat stone.
4. Build workbench.
5. Discover basic stone tools.
6. Learn to process wood.
7. Create primitive cutting tools.
8. Collect dry tinder.
9. Learn fire preparation.
10. Create the first ember.
11. Establish a reliable fire.
12. Discover water collection.
13. Build a basic shelter.
14. Continue into the existing science progression.

These are suggested ordering decisions.
Inspect existing quest definitions and map them to the appropriate sequence.
Do not introduce duplicate quests where equivalent quests already exist.
Do not unlock advanced quests before their prerequisites.
Optional discovery activities should remain optional and should not obstruct the main progression.
The new progression must integrate with the existing save system.
Persist:

* Current objective.
* Completed objectives.
* Objective progress.
* Collected materials.
* Construction progress.
* Learned interactions.
* Unlocked hints.
* Tutorial completion.

When the player returns:

* Restore the correct objective.
* Restore progress.
* Do not restart completed tutorials.
* Do not display previously completed objectives again.

Ensure old saves migrate safely.
Before coding:

1. Inspect the existing quest system.
2. Identify how quest prerequisites work.
3. Inspect the current floating card.
4. Inspect the hint UI.
5. Identify how resource collection triggers quest completion.
6. Identify the existing workbench construction requirements.
7. Identify the current save-state format.

Do not assume the existing quest system needs replacing.
Implement the improvements using the existing architecture.
TEST THESE SCENARIOS:
TEST 1:
Start a completely new game.
Expected:
Only the first stone objective is visible.
TEST 2:
Collect one stone.
Expected:
First objective completes and the next objective appears.
TEST 3:
Collect the required three additional stones.
Expected:
Progress updates correctly and the next objective unlocks.
TEST 4:
Open the flat-stone hint.
Expected:
A recognisable flat-stone image appears with clear instructions.
TEST 5:
Close the objective card.
Expected:
The card disappears without affecting quest progress.
TEST 6:
Reopen the objective card.
Expected:
The current objective and progress are restored.
TEST 7:
Complete the workbench.
Expected:
The game recognises the actual completed structure and unlocks the next objective.
TEST 8:
Save and reload.
Expected:
Progress remains intact.
TEST 9:
Attempt to complete a future objective early.
Expected:
It does not bypass required progression unless the existing design explicitly permits that action.
TEST 10:
Complete an objective using hands-only interaction.
Expected:
No controller or keyboard is required.
After implementation:

* Run typecheck.
* Run unit tests.
* Run production build.
* Test quest progression.
* Test card positioning in VR.
* Test direct fingertip interaction on Quest.

Do not claim actual Quest hardware validation unless performed.
PRIMAL should not expect a beginner to understand the game.
It should teach them naturally.
The player enters the forest.
The game asks them to find one stone.
They find it.
The game congratulates them and explains why they need more.
They collect three more.
They learn to recognise a flat stone.
They build their first workbench.
Each achievement introduces the next survival skill.
The player should gradually become capable of surviving without needing constant instructions.
The ultimate goal is to make the first 10–15 minutes of PRIMAL completely understandable, enjoyable and satisfying even for someone who has never played a VR survival game before.
Make the player feel guided, not controlled.
Make the progression feel like learning to survive, not completing a checklist.
