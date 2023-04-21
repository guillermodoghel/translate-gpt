import fs from 'fs';
import axios from 'axios';
import cheerio from 'cheerio';
import pLimit from 'p-limit';

const apiUrl = 'https://api.openai.com/v1/chat/completions';
const apiKey = process.env.GPT_API_KEY;

const inputHtmlFile = 'input.html';
const outputHtmlFile = 'output.html';
const targetLanguage = 'Korean';


const lineLimit = 200; // Set the maximum number of lines per block
const concurrencyLimit = 5; // Adjust this based on the rate limits
const limit = pLimit(concurrencyLimit);
async function translate(text, targetLanguage) {
    try {
        const response = await axios.post(
            apiUrl,
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful assistant that translates to ${targetLanguage} the text from chunks of an HTML file. Make sure to not translate pieces of code or css, or parameters between {{}}. Translate everything that the user would see. Do not add or close any tags, or change the structure of the HTML chunk you received, this might be included on another chunk from the same file.`
                    },
                    {
                        role: "user",
                        content: `Translate the following HTML: ${text}`,
                    },
                ],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error while translating:', error);
    }
}

async function translateHtmlFile(inputFile, outputFile, targetLanguage) {
    const htmlContent = fs.readFileSync(inputFile, 'utf-8');
    const $ = cheerio.load(htmlContent);
    const codeBlocks = [];

    $('*').each(function () {
        const html = $(this).html();
        const lines = html.split('\n');

        while (lines.length > 0) {
            const block = lines.splice(0, lineLimit).join('\n');
            if (block) {
                codeBlocks.push({ element: this, html: block });
            }
        }
    });

    const translationPromises = codeBlocks.map(block => limit(() => translate(block.html, targetLanguage)));

    const translatedHtmls = await Promise.all(translationPromises);

    translatedHtmls.forEach((translatedHtml, index) => {
        const block = codeBlocks[index];
        const currentHtml = $(block.element).html();
        const updatedHtml = currentHtml.replace(block.html, translatedHtml);
        $(block.element).html(updatedHtml);
    });

    fs.writeFileSync(outputFile, $.html());
    console.log(`Translated HTML file saved as "${outputFile}".`);
}

translateHtmlFile(inputHtmlFile, outputHtmlFile, targetLanguage);
