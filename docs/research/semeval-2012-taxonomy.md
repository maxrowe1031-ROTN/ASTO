# The Bejar/Chaffin/Embretson relation taxonomy — reference for ASTO

**What this is.** The complete taxonomy of semantic relations used by SemEval-2012
Task 2 ("Measuring Degrees of Relational Similarity"): **10 families, 79 relation
types**, each with three paradigm word pairs. It originates in Bejar, Chaffin &
Embretson (1991), developed at ETS to classify GRE verbal analogy items — i.e. it was
built for almost exactly ASTO's problem, by psychometricians, decades ago.

**Why it's here (2026-08-04).** Max noticed the pipeline's analogies "are similar in
that they are causal — one thing following another." Measured against the corpus, he
was right: **~80% of all 284 pairs ever authored are one-thing-becomes/produces-another.**
ASTO's homegrown 13-shape list turned out to sample only ~3 of these 10 families;
class-inclusion, attribute and non-attribute had never been visited at all, and
contrast + similar were collapsed into one shape. The likely mechanical cause is
rule-007's wording ("directional and **transformative**"), which read literally forbids
three of the four sets on Max's own approved First Light board.

**Provenance and license.** Word pairs and taxonomy from the SemEval-2012 Task 2 data
package, released under **CC-BY 3.0**; taxonomy due to Bejar, Chaffin & Embretson,
*Cognitive and Psychometric Analysis of Analogical Problem Solving* (Springer, 1991).
Sources: the task paper (Jurgens, Mohammad, Turney & Holyoak, 2012,
https://aclanthology.org/S12-1047/), the task site and data
(https://sites.google.com/site/semeval2012task2/), and the ETS report
(https://www.ets.org/research/policy_research_reports/publications/report/1987/hwqm.html).

**How to read it for ASTO.** This is a map, not a mandate. Family 5 (ATTRIBUTE) is
mostly what rule-007 rightly bans; family 6 (NON-ATTRIBUTE) may collide with the
word-familiarity rule (rule-012). The value is choosing the game's boundary
deliberately instead of discovering it by accident. Status per family as of
2026-08-04, from reading all 67 sets ever built: 8 (CAUSE-PURPOSE) is home (~80% of
everything); 2, 9 visited a handful of times; 4 twice (role reversals); 7 and 10 once
each; 1, 3 (except Conversion), 5, 6 never.

### 1 · CLASS-INCLUSION

| id | relation | paradigm pairs |
|---|---|---|
| 1a | Taxonomic | flower:tulip, emotion:rage, poem:sonnet |
| 1b | Functional | ornament:brooch, weapon:knife, vehicle:car |
| 1c | Singular Collective | cutlery:spoon, clothing:shirt, vermin:rat |
| 1d | Plural Collective | groceries:eggs, dishes:saucers, refreshments:sandwiches |
| 1e | ClassIndividual | queen:Elizabeth, river:Nile, mountain:Everest |

### 2 · PART-WHOLE

| id | relation | paradigm pairs |
|---|---|---|
| 2a | Object:Component | car:engine, face:nose, novel:epilogue |
| 2b | Collection:Member | forest:tree, anthology:poem, fleet:ship |
| 2c | Mass:Potion | water:drop, mile:yard, time:moment |
| 2d | Event:Feature | rodeo:cowboy, banquet:food, wedding:bride |
| 2e | Activity:Stage | shopping:buying, planting:gardening, kickoff:football |
| 2f | Item:Topological Part | room:corner, mountain:foot, table:top |
| 2g | Object:Stuff | glacier:ice, salt:sodium, lens:glass |
| 2h | Creature:Possession | millionaire:money, author:copyright, robin:nest |
| 2i | Item:Distinctive Nonpart | tundra:tree, horse:wings, perfection:fault |
| 2j | Item:Ex-part/Ex-possession | apostate:belief, wood:splinter, prisoner:freedom |

### 3 · SIMILAR

| id | relation | paradigm pairs |
|---|---|---|
| 3a | Synonymity | car:auto, buy:purchase, rapid:quick |
| 3b | Dimensional Similarity | enthusiasm:fervor, simmer:boil, stream:river |
| 3c | Dimensional Excessive | eating:gluttony, concerned:obsessed, bleeding:hemorrhage |
| 3d | Dimensional Naughty | copy:plagiarize, listen:eavesdrop, gaze:leer |
| 3e | Conversion | apprentice:master, colt:horse, grape:wine |
| 3f | Attribute Similarity | rake:fork, valley:gutter, painting:movie |
| 3g | Coordinates | ram:ewe, son:daughter, trackpad:mouse |
| 3h | Change | crescendo:sound, brighten:color, discount:price |

### 4 · CONTRAST

| id | relation | paradigm pairs |
|---|---|---|
| 4a | Contradictory | alive:dead, masculinity:femininity, remember:forget |
| 4b | Contrary | old:young, happy:sad, smooth:rough |
| 4c | Reverse | attack:defend, buy:sell, love:hate |
| 4d | Directional | front:back, left:right, east:west, before:after, inside:outside |
| 4e | Incompatible | happy:morbid, vigilant:careless, slow:stationary |
| 4f | Asymmetric Contrary | hot:cool, destitute:rich, tiny:large, dry:moist |
| 4g | Pseudoantonym | popular:shy. right:bad, believe:deny |
| 4h | Defective | fallacy:logic, astigmatism:sight, limp:walk |

### 5 · ATTRIBUTE

| id | relation | paradigm pairs |
|---|---|---|
| 5a | ItemAttribute(noun:adjective) | beggar:poor, glass:fragile, hero:brave |
| 5b | Object Attribute:Condition | brittle:broken, malleable:molded, edible:eaten |
| 5c | ObjectState(noun:noun) | beggar:poverty, dupe:gullibility, novice:inexperience |
| 5d | Agent Attribute:State | contentious:conflict, taciturn:silence, celibate:abstinence |
| 5e | Object:Typical Action (noun.verb) | glass:break, soldier:fight, juggernaut:crush |
| 5f | Agent/ObjectAttribute:Typical Action | viable:live, salient:notice, brittle:break |
| 5g | Action:Action Attribute | creep:slow, exercise:vigorous, longing:passionate |
| 5h | Action:Object Attribute | sterilize:infectious. capture:elusive, drink:potable |
| 5i | Action:Resultant Attribute (verb:noun/adjective) | rain:wet, riddle:holes, homogenize:uniform |

### 6 · NON-ATTRIBUTE

| id | relation | paradigm pairs |
|---|---|---|
| 6a | Item:Nonattribute (noun:adjective) | harmony:discordant, bulwark: flimsy, sound:inaudible |
| 6b | ObjectAttribute:Noncondition (adjective:adjective) | brittle:molded, inconsolable:comforted, exemplary:criticized |
| 6c | Object:Nonstate (noun:noun) | laureate:dishonor, famine:plenitude, war:tranquility, desert:lushness |
| 6d | Attribute:Nonstate (adjective:noun) | dull:cunning, immortal:death, celibate:promiscuity |
| 6e | Objects:Atypical Action (noun:verb) | recluse:socialize, ascetic:indulge, patron:disparage |
| 6f | Agent/Object Attribute: Atypical Action (adjective:verb) | reticent:talk, obtrusive:ignore, garbled:comprehend |
| 6g | Action:Action Nonattribute | creep:fast, fade:abruptly, scream:quietly, destroy:gently |
| 6h | Action:Object Nonattribute | embellish:austere, obliterate:extant, cook:raw, mend:broken, contaminate:pure |

### 7 · CASE RELATIONS

| id | relation | paradigm pairs |
|---|---|---|
| 7a | Agent:Object | tailor:suit, oracle:prophesy, baker:flour |
| 7b | Agent:Recipient | doctor:patient, mentor:protege, judge:litigant |
| 7c | Agent:Instrument | farmer:tractor, conductor:baton, arsonist:match |
| 7d | Action:Object | plow:earth, sing:dirge, pardon:sin |
| 7e | Action:Recipient | bequeath:heir, teach:student, announce:listener |
| 7f | Object:Recipient | inheritance:heir, speech:audience, honor:laureate |
| 7g | Object:Instrument | patient:stethoscope, violin:bow, pipe:wrench |
| 7h | Recipient:Instrument | heir:testament, king:crown, graduate:diploma, police:badge |

### 8 · CAUSE-PURPOSE

| id | relation | paradigm pairs |
|---|---|---|
| 8a | Cause:Effect | enigma:puzzlement, joke:laughter, practice:improvement |
| 8b | Cause:Compensatory Action | hunger:eat, fatigue:sleep, lateness:hurry |
| 8c | EnablingAgent:Object | match:candle, gasoline:car, mnemonic:memory |
| 8d | Action/Activity:Goal | eat:satiation flee:escape, fertilize:grow |
| 8e | Agent:Goal | pilgrim:shrine, assassin:death, climber:peak |
| 8f | Instrument:Goal | anesthetic:numbness. ballast:stability, camouflage:concealment |
| 8g | Instrument:Intended Action | gun:shoot, pestle:mash, abacus:calculate |
| 8h | Prevention | pesticide:vermin, antidote:poison, lubricate:friction |

### 9 · SPACE-TIME

| id | relation | paradigm pairs |
|---|---|---|
| 9a | Item:Location | arsenal:weapon, seminary:theologian, bookshelf:books |
| 9b | Location:Process/Product | bakery:bread, quarry:rock, laboratory:science |
| 9c | Location:Action/Activity | school:learning, gym:exercise, highway:driving |
| 9d | Location:Instrument/Associated Item | school:textbook, farm:tractor, beach:swimsuit |
| 9e | Contiguity | coast:ocean, sidewalk:road, horizon:sky, fence:property |
| 9f | Time Action/Activity | summer:harvest, childhood:play, spring:graduation |
| 9g | Time Associated Item | retirement:pension, infancy:cradle, adolescence:textbooks |
| 9h | Sequence | prologue:narrative, inception:development, coda:symphony |
| 9i | Attachment | belt:waist, rivet:girder, bowler:head |

### 10 · REFERENCE

| id | relation | paradigm pairs |
|---|---|---|
| 10a | Sign:Significant | siren:danger, scepter:authority, signature:approval |
| 10b | Expression | smile:friendliness, lamentation:grief, hug:affection |
| 10c | Representation | person:portrait, backdrop:vista, diary:person |
| 10d | Plan | recipe:cake, syllabus:course, blueprint:building |
| 10e | Knowledge | psychology:minds, astronomy:stars, ballistics:projectiles |
| 10f | Concealment | alias:name, camouflage:location, disguise:identity |
