-- Five plugins. Neovim's built-in treesitter covers Lua, Vim script,
-- Markdown and C; everything else gets regex highlighting, which is fine for
-- quick edits and needs no C compiler.
return {
  {
    -- Same palette as the starship prompt.
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = { flavour = "mocha", transparent_background = true }, -- the old vimrc cleared the background too
    config = function(_, opts)
      require("catppuccin").setup(opts)
      vim.cmd.colorscheme("catppuccin")
    end,
  },
  {
    -- Finder on top of the fzf binary the installer puts on PATH.
    "ibhagwan/fzf-lua",
    cmd = "FzfLua",
    keys = {
      { "<leader>ff", "<cmd>FzfLua files<cr>", desc = "Find files" },
      { "<leader>fg", "<cmd>FzfLua live_grep<cr>", desc = "Grep" },
      { "<leader>fb", "<cmd>FzfLua buffers<cr>", desc = "Buffers" },
      { "<leader>fr", "<cmd>FzfLua oldfiles<cr>", desc = "Recent files" },
      { "<leader>fh", "<cmd>FzfLua helptags<cr>", desc = "Help" },
      { "<leader>gs", "<cmd>FzfLua git_status<cr>", desc = "Git status" },
    },
    opts = {},
  },
  {
    -- File browser as an editable buffer; replaces the old NERDTree mapping.
    "stevearc/oil.nvim",
    lazy = false,
    keys = {
      { "-", "<cmd>Oil<cr>", desc = "Parent directory" },
      { "<C-n>", function() require("oil").toggle_float() end, desc = "File browser" },
    },
    opts = { view_options = { show_hidden = true } },
  },
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      on_attach = function(buf)
        local gs = require("gitsigns")
        local map = function(lhs, rhs, desc) vim.keymap.set("n", lhs, rhs, { buffer = buf, desc = desc }) end
        map("]h", function() gs.nav_hunk("next") end, "Next hunk")
        map("[h", function() gs.nav_hunk("prev") end, "Previous hunk")
        map("<leader>gp", gs.preview_hunk, "Preview hunk")
        map("<leader>gr", gs.reset_hunk, "Reset hunk")
        map("<leader>gb", gs.blame_line, "Blame line")
      end,
    },
  },
  {
    -- Shows what the leader mappings are after pressing <space>.
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      spec = {
        { "<leader>f", group = "find" },
        { "<leader>g", group = "git" },
      },
    },
  },
}
