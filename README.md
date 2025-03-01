# Obsidian-MindForge

# Cognitive Weight Plugin README

## 1. Overview

The Cognitive Weight Plugin is designed for Obsidian, aiming to enhance the user's understanding and management of their knowledge base. It calculates cognitive weights for files, tracks user interactions, and provides features for memory review and cognitive stage detection.

## 2. Features

1. **Cognitive Weight Calculation**
   - Calculates the cognitive weight of each file based on factors like initial weight, decay coefficient, interaction count, and time decay. The weight formula is adjusted with daily and annual cycles, considering factors such as `lambda` (decay coefficient) and `beta` (interaction coefficient).
   - For example, the time decay factor is calculated as `this.plugin.settings.alpha * data.initialWeight * Math.exp(-lambda * sqrtDays)`, where `sqrtDays` is the square root of the number of days elapsed since the last update.
2. **Interaction Tracking**
   - Tracks user interactions with files. When a file is created, modified, or its content is edited, the plugin records the interaction.
   - It calculates interaction - related metrics such as engagement. Engagement is calculated based on the total interaction duration and the number of links in the file, with a sliding window Exponential Moving Average (EMA) applied for a more stable score.
3. **Cognitive Stage Detection**
   - Determines the cognitive stage of a user's knowledge in a file (e.g., '新手', '进阶', '专家') by analyzing scores related to complexity, engagement, and centrality.
   - Complexity is calculated by processing the text content, removing Markdown and HTML elements, and using linguistic features like sentence and word counts, syllable counts, and the Flesch - Kincaid grade level. Centrality is calculated using a PageRank - like algorithm on the link graph of the Markdown files in the vault.
4. **Memory Review System**
   - Generates review questions for files based on their content. The questions are generated using the DeepSeek API. The plugin can detect due files for review based on memory strength, cognitive weight, and the time since the last review.
   - The review session presents questions in a modal, allowing users to answer and get feedback on their responses. The memory strength of a file is updated based on the user's answer correctness.

## 3. Installation

1. **Manual Installation**
   - Download the plugin files from the [GitHub repository](https://github.com/oGYCo/Obsidian-MindForge).
   - Navigate to your Obsidian vault's `.obsidian/plugins` folder.
   - Create a new folder for the Cognitive Weight Plugin if it doesn't exist.
   - Place the downloaded plugin files (`.js`, `.css`, etc.) into the new folder.
2. **Using Obsidian Community Plugins (if available)**
   - Open Obsidian.
   - Go to `Settings` > `Community plugins`.
   - Search for "Cognitive Weight Plugin" in the plugin list.
   - Click `Install` and then `Enable` the plugin.

## 4. Configuration

1. **Open the Settings Tab**
   - In Obsidian, go to `Settings` > `Cognitive Weight Plugin`.
2. **Settings Options**
   - **Initial Weight**: The starting weight for new files. Default is `0.5`.
   - **Decay Coefficient (λ)**: Controls how quickly the cognitive weight decays over time. Default is `0.05`.
   - **Interaction Coefficient (β)**: Determines the impact of user interactions on the cognitive weight. Default is `0.2`.
   - **Daily Update Time**: The time at which the daily decay of cognitive weights is applied. Default is `02:00`.
   - **Alpha Coefficient (α)**: Used in the time decay formula. Default is `1`.
   - **DeepSeek API Key**: Required for generating review questions. Enter your valid DeepSeek API key here.
   - **Temperature**: Affects the randomness of the generated questions. Ranges from `0` to `1`, with a default of `0.7`.
   - **Max Tokens**: Limits the length of the generated responses from the DeepSeek API. Default is `1000`.
   - **验证 API 密钥**: Click the `验证` button to check the validity of the entered DeepSeek API key. The plugin will attempt to make a test request to the API to verify it.

## 5. Usage

1. **File - related Interactions**
   - When you create or modify a Markdown file in your Obsidian vault, the plugin automatically updates the interaction count and related metadata for that file.
   - As you edit the content of a file, the plugin tracks the interaction duration and calculates engagement metrics.
2. **Review Sessions**
   - To start a review session, use the `开始记忆复习` command in the Obsidian command palette. The plugin will select due files based on memory strength and other criteria and generate review questions for them.
   - During the review session, answer the questions presented in the modal. The plugin will provide feedback on whether your answer is correct or incorrect and update the memory strength of the corresponding file.
3. **Cognitive Stage Detection**
   - Use the `检测认知阶段` command in the Obsidian command palette. The plugin will analyze the current active file and calculate its complexity, engagement, and centrality scores to determine the cognitive stage. It will then display a notice with the detected stage and relevant scores.

## 6. API Usage

1. **Question Generation API**
   - The plugin uses the DeepSeek API to generate review questions. The API endpoint used is `https://api.deepseek.com/v1/chat/completions`.
   - To generate a question, the plugin sends a POST request with the following parameters:
     - `model`: set to `deepseek - chat`.
     - `messages`: an array containing a user - role message with a prompt built from the file content. The prompt asks for a professional multiple - choice question with specific requirements.
     - `temperature`: set according to the plugin's configuration.
     - `max_tokens`: set according to the plugin's configuration.
     - `top_p`: set to `0.95`.
2. **API Key Validation**
   - The plugin validates the DeepSeek API key by making a test request to the chat completions endpoint. It checks if the key is in the correct format (starts with `sk -`) and if the API returns a valid response.

## 7. Development

1. **Prerequisites**
   - Node.js and npm (Node Package Manager) installed on your development machine.
2. **Clone the Repository**
   - Run `git clone https://github.com/oGYCo/Obsidian-MindForge.git` in your terminal.
3. **Install Dependencies**
   - Navigate to the cloned repository folder in the terminal.
   - Run `npm install` to install all the required dependencies.
4. **Build and Run**
   - Use the appropriate build commands (e.g., `npm run build`) to build the plugin.
   - To test the plugin in Obsidian, you can use the Obsidian development server or manually copy the built files to your Obsidian vault's plugin folder.

## 8. License

This plugin is released under the MIT license. See the `LICENSE` file in the repository for details.

## 9. Support and Feedback

If you encounter any issues or have suggestions for improvement, please open an issue on the [GitHub repository](https://github.com/oGYCo/Obsidian-MindForge/issues). You can also reach out to the plugin developer at [your email address] for support.
