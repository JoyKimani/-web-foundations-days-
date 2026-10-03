let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const searchTerm = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(searchTerm));
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  return notes.reduce((longest, note) =>
    note.text.length > longest.text.length ? note : longest
  );
}

function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };

  for (const note of notes) {
    counts[note.category] += 1;
  }

  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noteLabel = total === 1 ? "note" : "notes";

  return `${total} ${noteLabel}: ${counts.personal} personal, ${counts.work} work, ${counts.study} study.`;
}

function normalizeText(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isDuplicate(text) {
  const normalizedText = normalizeText(text);
  return notes.some((note) => normalizeText(note.text) === normalizedText);
}

function addNote(text, category) {
  if (typeof text !== "string") {
    console.log("Note not added: text must be a string.");
    return false;
  }

  const cleanedText = text.trim();
  if (cleanedText.length < 1 || cleanedText.length > 200) {
    console.log("Note not added: text must be 1 to 200 characters.");
    return false;
  }

  if (!["personal", "work", "study"].includes(category)) {
    console.log("Note not added: category must be personal, work, or study.");
    return false;
  }

  if (isDuplicate(cleanedText)) {
    console.log("Note not added: a note with the same text already exists.");
    return false;
  }

  const nextId =
    notes.reduce((largestId, note) => Math.max(largestId, note.id), 0) + 1;
  notes.push({ id: nextId, text: cleanedText, category });
  console.log("Note added.");
  return true;
}

console.log('searchNotes("JAVASCRIPT"):', searchNotes("JAVASCRIPT")); // Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]
console.log('searchNotes("missing"):', searchNotes("missing")); // Expected: []

const startingNotes = notes;
console.log("longestNote():", longestNote()); // Expected: note with id 3
notes = [];
console.log("longestNote() with no notes:", longestNote()); // Expected: null
notes = startingNotes;

console.log("countByCategory():", countByCategory()); // Expected: { personal: 2, work: 1, study: 2 }
notes = [];
console.log("countByCategory() with no notes:", countByCategory()); // Expected: { personal: 0, work: 0, study: 0 }
notes = startingNotes;

console.log("getSummary():", getSummary()); // Expected: "5 notes: 2 personal, 1 work, 2 study."
notes = [{ id: 1, text: "One note", category: "study" }];
console.log("getSummary() with one note:", getSummary()); // Expected: "1 note: 0 personal, 0 work, 1 study."
notes = startingNotes;

console.log('isDuplicate("  BUY   MILK AND BREAD "):', isDuplicate("  BUY   MILK AND BREAD ")); // Expected: true
console.log('isDuplicate("A new note"):', isDuplicate("A new note")); // Expected: false

console.log('addNote("Plan the weekend", "personal"):', addNote("Plan the weekend", "personal")); // Expected: true
console.log('addNote(" plan   the WEEKEND ", "personal"):', addNote(" plan   the WEEKEND ", "personal")); // Expected: false (duplicate)
console.log('addNote("Review notes", "other"):', addNote("Review notes", "other")); // Expected: false (invalid category)
console.log('addNote("   ", "work"):', addNote("   ", "work")); // Expected: false (invalid length)
console.log('addNote("201 characters", "work"):', addNote("x".repeat(201), "work")); // Expected: false (invalid length)
console.log("Updated summary:", getSummary()); // Expected: "6 notes: 3 personal, 1 work, 2 study."
