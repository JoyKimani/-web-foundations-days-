const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusMessage = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

const USERS_URL = "https://jsonplaceholder.typicode.com/users";
const KENYAN_PROFILES = [
  { name: "Wanjiku Kamau", email: "wanjiku.kamau@example.com", city: "Nairobi" },
  { name: "Otieno Odhiambo", email: "otieno.odhiambo@example.com", city: "Kisumu" },
  { name: "Amina Hassan", email: "amina.hassan@example.com", city: "Mombasa" },
  { name: "Chebet Kiplagat", email: "chebet.kiplagat@example.com", city: "Eldoret" },
  { name: "Barasa Wekesa", email: "barasa.wekesa@example.com", city: "Kakamega" },
  { name: "Nyambura Kariuki", email: "nyambura.kariuki@example.com", city: "Nyeri" },
  { name: "Mutua Muli", email: "mutua.muli@example.com", city: "Machakos" },
  { name: "Atieno Achieng", email: "atieno.achieng@example.com", city: "Nakuru" },
  { name: "Juma Bakari", email: "juma.bakari@example.com", city: "Malindi" },
  { name: "Kamau Mwangi", email: "kamau.mwangi@example.com", city: "Meru" },
];
let users = [];

function createDetail(label, value) {
  const detail = document.createElement("div");
  const detailLabel = document.createElement("p");
  const detailValue = document.createElement("p");

  detailLabel.classList.add("detail-label");
  detailLabel.textContent = label;
  detailValue.classList.add("detail-value");
  detailValue.textContent = value;
  detail.append(detailLabel, detailValue);

  return detail;
}

function renderUsers(list) {
  usersList.replaceChildren();

  if (list.length === 0 && filterInput.value.trim()) {
    const emptyState = document.createElement("li");
    emptyState.classList.add("empty-state");
    emptyState.textContent = "No users match your filter.";
    usersList.append(emptyState);
    return;
  }

  for (const user of list) {
    const card = document.createElement("li");
    const name = document.createElement("h3");
    const email = document.createElement("p");
    const details = document.createElement("div");

    card.classList.add("user-card");
    name.textContent = user.name;
    email.classList.add("user-email");
    email.textContent = user.email;
    details.classList.add("user-details");
    details.append(
      createDetail("City", user.address?.city || "Not provided"),
      createDetail("Company", user.company?.name || "Not provided")
    );

    card.append(name, email, details);
    usersList.append(card);
  }
}

async function loadUsers() {
  loadButton.disabled = true;
  usersList.setAttribute("aria-busy", "true");
  statusMessage.textContent = "Loading users...";

  try {
    const response = await fetch(USERS_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const result = await response.json();
    if (!Array.isArray(result)) {
      throw new Error("The server returned an unexpected response.");
    }

    users = result.map((user, index) => {
      const profile = KENYAN_PROFILES[index % KENYAN_PROFILES.length];

      return {
        ...user,
        name: profile.name,
        email: profile.email,
        address: { ...user.address, city: profile.city },
      };
    });
    const filter = filterInput.value.trim().toLowerCase();
    const filteredUsers = users.filter((user) => user.name.toLowerCase().includes(filter));
    renderUsers(filteredUsers);
    statusMessage.textContent = `Loaded ${users.length} ${users.length === 1 ? "user" : "users"}.`;
  } catch {
    statusMessage.textContent = "Could not load users. Check your connection and try again.";
  } finally {
    loadButton.disabled = false;
    usersList.setAttribute("aria-busy", "false");
  }
}

loadButton.addEventListener("click", loadUsers);

filterInput.addEventListener("input", () => {
  const filter = filterInput.value.trim().toLowerCase();
  const filteredUsers = users.filter((user) => user.name.toLowerCase().includes(filter));
  renderUsers(filteredUsers);
});
