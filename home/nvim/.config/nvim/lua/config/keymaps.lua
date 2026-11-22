-- The ~/.vimrc mappings, then leader mappings for the plugins (see plugins/).
local map = vim.keymap.set

-- System clipboard
map("v", "<C-c>", '"+y', { desc = "Copy to clipboard" })
map("v", "<C-x>", '"+d', { desc = "Cut to clipboard" })
map("v", "<C-v>", '"_d"+P', { desc = "Paste over selection" })
map("i", "<C-v>", "<C-r><C-o>+", { desc = "Paste from clipboard" })

-- Tabs
map("n", "<S-t>", "<cmd>tab split<cr>", { desc = "Open in a new tab" })
map("n", "<S-Tab>", "<cmd>tabnext<cr>", { desc = "Next tab" })
map("n", "<A-Tab>", "<cmd>tabprevious<cr>", { desc = "Previous tab" })

-- Resize splits
map("n", "<C-Left>", "<cmd>vertical resize +2<cr>", { desc = "Wider" })
map("n", "<C-Right>", "<cmd>vertical resize -2<cr>", { desc = "Narrower" })
map("n", "<C-Up>", "<cmd>resize +2<cr>", { desc = "Taller" })
map("n", "<C-Down>", "<cmd>resize -2<cr>", { desc = "Shorter" })

map("n", "<Esc>", "<cmd>nohlsearch<cr>", { desc = "Clear search highlight" })
